interface Props {
  icon: string;
  label: string;
  value: string;
}

export default function DetailRow({ icon, label, value }: Props) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-base flex-shrink-0 mt-0.5">{icon}</span>
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-sm text-gray-800 font-medium mt-0.5">{value}</p>
      </div>
    </div>
  );
}
