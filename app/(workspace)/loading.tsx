import styles from "@/components/layout/page-loading.module.css";

export default function WorkspaceLoading() {
  return <section className={styles.loading} aria-busy="true" aria-label="Đang tải trang mới">
    <p className={styles.status} role="status">Đang tải dữ liệu…</p>
    <div className={styles.heading} aria-hidden="true" />
    <div className={styles.cards} aria-hidden="true">
      {[0, 1, 2, 3].map(index => <div className={styles.card} key={index}>
        <div className={styles.label} /><div className={styles.value} />
      </div>)}
    </div>
    <div className={styles.panel} aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map(index => <div className={styles.row} key={index} />)}
    </div>
  </section>;
}
