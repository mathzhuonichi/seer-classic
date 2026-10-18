interface Props {holders:{uid:string;name:string}[];value:string;onChange:(uid:string)=>void;className?:string}

/** Picks which holder a finite engraving moves from when stock is empty or the equip cap is reached. */
export default function EngravingTransferSource({holders,value,onChange,className}:Props) {
  return <label className={className}>移装来源<select aria-label="刻印移装来源" value={value} onChange={event=>onChange(event.target.value)}>
    {holders.map(holder=><option key={holder.uid} value={holder.uid}>{holder.name}</option>)}</select></label>;
}
