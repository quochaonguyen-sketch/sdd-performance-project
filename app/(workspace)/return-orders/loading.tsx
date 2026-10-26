import styles from "@/components/return-orders/return-workspace.module.css";

export default function LoadingReturnOrders() {
  return <div className={styles.workspace} aria-busy="true"><p role="status">Đang tải hàng trả…</p><div className={styles.kpis} aria-hidden="true">{[1,2,3,4].map(i=><div className={styles.kpi} style={{minHeight:140}} key={i}/>)}</div><div className={styles.ledger} style={{minHeight:400}} aria-hidden="true"/></div>;
}
