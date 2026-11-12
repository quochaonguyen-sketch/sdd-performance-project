import { ImageResponse } from "next/og";
import type { ReactNode } from "react";
import type { WhSeatalkReport } from "./seatalk-report";

const width = 1440;
const navy = "#1c2b49";
const header = "#293b60";
const ink = "#132544";
const white = "#ffffff";
const line = "#d7dce5";
const zebra = "#f4f6fa";
const green = "#007564";
const red = "#aa2323";
const orange = "#a05200";
const blue = "#22639b";
const rowHeight = 36;

function Row({ cells, widths, background, color = ink, size = 15, height = rowHeight, bold = false, align = [], wrap = [] }: {
  cells: ReactNode[]; widths: number[]; background: string; color?: string; size?: number; height?: number; bold?: boolean; align?: number[]; wrap?: number[];
}) {
  const totalWidth = widths.reduce((a, b) => a + b, 0);
  return <div style={{ display: "flex", background, height, width, borderBottom: `1px solid ${line}` }}>
    {cells.map((value, i) => <div key={i} style={{
      display: "flex", alignItems: "center", justifyContent: align.includes(i) ? "flex-start" : "center",
      flexShrink: 0, width: width * widths[i] / totalWidth, padding: "0 7px", borderRight: `1px solid ${line}`,
      fontSize: size, fontWeight: bold ? 700 : 400, color,
    }}>
      {typeof value === "object" ? value : <span style={wrap.includes(i)
        ? { overflow: "hidden", WebkitLineClamp: 2, lineHeight: "16px", wordBreak: "break-word" }
        : { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>}
    </div>)}
  </div>;
}

function Band({ children, height, size, background, color = white }: {
  children: ReactNode; height: number; size: number; background: string; color?: string;
}) {
  return <div style={{ display: "flex", alignItems: "center", width, height, padding: "0 16px", background, color, fontSize: size }}>{children}</div>;
}

const percent = (value: number) => `${value.toFixed(1)}%`;
const kpiLabels = ["Total", "Created", "WH Ready", "Backlog", "Received D0", "Delivering", "Delivered", "Riders", "Success Rate", "Unassigned", "On-Hold", "Late", "On time"];
const areaLabels = ["Area", "Total", "Backlog", "Received", "Delivering", "Delivered", "Success Rate", "Unassigned", "On-Hold", "Chart", "Riders", "Late", "On time"];
const areaWidths = [136, 88, 96, 102, 105, 105, 126, 111, 100, 160, 100, 86, 125];
const riderLabels = ["Tracking", "Tên tài xế", "Area", "Attempt", "District", "Ward", "Create", "Status", "Time Remaining", "Ontime 4H", "WH Ontime", "Ontime SDD"];
const riderWidths = [170, 190, 48, 88, 126, 146, 109, 105, 126, 100, 112, 120];
const chartKeys = [["Delivered", green], ["Received", blue], ["Unassigned", red], ["On-Hold", orange], ["Backlog", "#c68a16"]] as const;

function areaBar(row: WhSeatalkReport["totals"]) {
  const values = [row.delivered, row.received, row.unassigned, row.onhold, row.areaBacklog];
  const sum = values.reduce((total, value) => total + Math.max(0, value), 0);
  return sum ? <div style={{ display: "flex", width: 135, height: 12 }}>
    {chartKeys.map(([label, color], i) => values[i] > 0 && <div key={label} style={{ width: 135 * values[i] / sum, height: 12, background: color }} />)}
  </div> : "—";
}

export function whSeatalkImage(report: WhSeatalkReport, index: number) {
  const t = report.totals;
  const kpis = [t.total, t.created, t.ready, t.backlog, t.received, t.delivering, t.delivered, t.riders, percent(t.rate), t.unassigned, t.onhold, t.late, t.ontime];
  const kpiColors = [ink, orange, orange, orange, blue, orange, green, blue, green, red, orange, red, green];
  const kpiWidths = kpiLabels.map(() => 1);
  const areaRows = [...report.areas, { area: "Total", ...t }];
  const riderRows = report.riders[index - 1] ?? [];
  const dashboard = index === 0;
  const height = dashboard ? 256 + rowHeight * areaRows.length : 114 + rowHeight * Math.max(1, riderRows.length);

  return new ImageResponse(<div style={{ display: "flex", flexDirection: "column", width, height, background: white, color: ink }}>
    <Band height={50} size={27} background={navy}>
      <span style={{ fontWeight: 700 }}>{dashboard ? "SPX High Value · Dashboard" : "SPX High Value · Rider Delivery"}</span>
      <span style={{ marginLeft: "auto", fontSize: 16, color: "#d8e8ff" }}>Hub 4232</span>
    </Band>
    <Band height={28} size={16} background={navy} color="#d8e8ff">
      <span>{report.stamp}</span>
      {!dashboard && <span style={{ marginLeft: "auto" }}>{`${t.total} đơn · Trang ${index}/${report.riders.length}`}</span>}
    </Band>
    {dashboard ? <div style={{ display: "flex", flexDirection: "column" }}>
      <Row cells={kpiLabels} widths={kpiWidths} background={header} color={white} bold height={32} />
      <Row cells={kpis.map((v, i) => <span key={i} style={{ color: kpiColors[i] }}>{v}</span>)} widths={kpiWidths} background={white} size={27} height={56} bold />
      <Band height={28} size={13} background={white} color={ink}>
        {chartKeys.map(([label, color]) => <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, marginRight: 18 }}>
          <span style={{ width: 10, height: 10, background: color }} />{label}
        </div>)}
      </Band>
      <Band height={30} size={16} background={navy}>ORDERS BY AREA</Band>
      <Row cells={areaLabels} widths={areaWidths} background={header} color={white} bold height={32} />
      {areaRows.map((row, i) => <Row key={row.area} widths={areaWidths} align={[0]} bold={row.area === "Total"}
        background={row.area === "Total" ? navy : i % 2 ? zebra : white} color={row.area === "Total" ? white : ink}
        cells={[row.area === "UNRESOLVED" ? "Chưa rõ KV" : row.area, row.total, row.area === "Total" ? t.backlog : row.areaBacklog, row.received,
          row.delivering, row.delivered, percent(row.rate), row.unassigned, row.onhold, row.area === "Total" ? "—" : areaBar(row), row.riders, row.late, row.ontime]} />)}
    </div> : <div style={{ display: "flex", flexDirection: "column" }}>
      <Row cells={riderLabels} widths={riderWidths} background={header} color={white} bold />
      {riderRows.map((row, i) => <Row key={i} widths={riderWidths} align={[0, 1, 4, 5]} wrap={[0, 1, 4, 5]} size={14}
        background={row.status === "Delivered" ? "#def1e7" : row.status === "Delivering" ? "#fff4cf" : row.status === "On-Hold" ? "#fbe7da" : i % 2 ? zebra : white}
        cells={row.cells.map((cell, j) => j >= 8 && (cell === "On time" || cell === "Late" || cell === "Quá hạn")
          ? <span key={j} style={{ color: cell === "On time" ? green : red, fontWeight: 700 }}>{cell}</span> : cell)} />)}
      {riderRows.length === 0 && <Band height={rowHeight} size={15} background={zebra} color={ink}>Không có đơn HV trong báo cáo.</Band>}
    </div>}
  </div>, { width, height, headers: { "Cache-Control": "private, no-store" } });
}
