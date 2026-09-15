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
