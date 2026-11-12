from concurrent.futures import ThreadPoolExecutor
import json
import re
import sys
import time

import requests

from sdd_data.clients import SpxClient
from sdd_data.config import Settings
from sdd_data.wh_tracking import TRACKING_INFO


LOG_URL = 'https://spx.shopee.vn/api/fleet_order/order/detail/unsuccessful_operation_log_list'


def get(client, url, params):
    for attempt in range(3):
        try:
            response = client.session().get(url, params=params, timeout=20, allow_redirects=False)
        except requests.RequestException:
            if attempt == 2:
                raise ValueError('connection') from None
            time.sleep(attempt + 1)
            continue
        if (response.status_code == 429 or response.status_code >= 500) and attempt < 2:
            retry = response.headers.get('Retry-After', '')
            time.sleep(min(int(retry), 10) if retry.isdigit() else attempt + 1)
            continue
        if response.status_code != 200:
            raise ValueError(f'HTTP {response.status_code}')
        try:
            body = response.json()
        except ValueError:
            raise ValueError('invalid JSON') from None
        if not isinstance(body, dict) or body.get('retcode') not in (0, '0') or not isinstance(body.get('data'), dict):
            raise ValueError(f"SPX {body.get('retcode', 'invalid response') if isinstance(body, dict) else 'invalid response'}")
        return body['data']
    raise AssertionError('unreachable')


def tracking(client, shipment):
    data = get(client, TRACKING_INFO, {'shipment_id': shipment})
    if str(data.get('shipment_id') or '').upper() != shipment or not isinstance(data.get('tracking_list'), list):
        raise ValueError('invalid tracking list')
    stack, result = list(data['tracking_list']), []
    while stack:
        event = stack.pop()
        if not isinstance(event, dict):
            continue
        for key in ('children', 'event_children'):
            if isinstance(event.get(key), list):
                stack.extend(event[key])
        status, at = str(event.get('status')), str(event.get('timestamp'))
        if not status.isdigit() or not at.isdigit() or not int(at):
            continue
        item = {'status': int(status), 'at': int(at), 'station': int(event.get('station_id') or 0)}
        if item['status'] in (2, 4, 39):
            operator = str(event.get('operator') or '').strip()
            match = re.fullmatch(r'\[(\d+)\]\s*([^\[\];,\n]+)', operator)
            staff_id = str(event.get('biz_staff_id') or '').strip()
            staff_name = str(event.get('biz_staff_name') or '').strip()
            if match:
                item.update(code=match[1], rider=match[2].strip())
            elif staff_id.isdigit() and staff_name:
                item.update(code=staff_id, rider=staff_name)
            elif re.fullmatch(r'[^\[\]@,;\d]+\s+[^\[\]@,;\d]+', operator) and operator.lower() not in ('system operator', 'spx system'):
                item.update(rider=operator)
        result.append(item)
    return result


def failure_logs(client, shipment):
    rows, total = [], None
    for page in range(1, 101):
        data = get(client, LOG_URL, {'shipment_id': shipment, 'pageno': page, 'count': 10, 'tdflag': 0})
        batch, size = data.get('list'), str(data.get('total'))
        if page == 1 and size == '0' and batch in (None, []):
            return {'items': []}
        if str(data.get('pageno')) != str(page) or not size.isdigit() or not isinstance(batch, list):
            raise ValueError('invalid log page')
        if total is not None and total != int(size):
            raise ValueError('log total changed')
        total = int(size)
        rows.extend(batch)
        if len(rows) == total:
            break
        if not batch or len(rows) > total:
            raise ValueError('incomplete log pages')
    else:
        raise ValueError('log page limit')
    items = []
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError('invalid log record')
        if str(row.get('app') or '').strip().casefold() != 'driver app':
            continue
        operator = re.sub(r'^\s*\[\d+\]\s*', '', str(row.get('operator') or '')).strip()
        at = str(row.get('operate_time') or '')
        if operator and at.isdigit() and int(at):
            items.append({'at': int(at), 'rider': operator[:200], 'error': str(row.get('error') or '')[:2000]})
    return {'items': items}


def main():
    jobs = json.load(sys.stdin)
    client = SpxClient(Settings.load())
    try:
        def lookup(job):
            shipment = job['shipment_id']
            if not re.fullmatch(r'VN[A-Z0-9]{3,40}', shipment):
                raise ValueError('invalid shipment ID')
            result = {'shipment_id': shipment, 'errors': []}
            for key, method in [('tracking', tracking), ('logs', failure_logs)]:
                if job[key]:
                    try:
                        result[key] = method(client, shipment)
                    except (ValueError, requests.RequestException) as error:
                        result['errors'].append(f'{key}: {error}' if isinstance(error, ValueError) else f'{key}: connection')
            return result

        with ThreadPoolExecutor(max_workers=4) as pool:
            for result in pool.map(lookup, jobs):
                print(json.dumps(result, ensure_ascii=True), flush=True)
    finally:
        client.close()


if __name__ == '__main__':
    main()
