export function SkelRows({ cols = 1, count = 5 }) {
  return (
    <tbody>
      {Array.from({ length: count }, (_, i) => (
        <tr key={i}>
          <td colSpan={cols}>
            <div className="skel-line" style={{ width: `${Math.max(30, 100 - i * 14)}%` }} />
          </td>
        </tr>
      ))}
    </tbody>
  );
}

export function SkelCard() {
  return (
    <div className="skel-card">
      <div className="skel-line" style={{ width: "60%", height: 16, marginBottom: 8 }} />
      <div className="skel-line" style={{ width: "40%", height: 12 }} />
    </div>
  );
}
