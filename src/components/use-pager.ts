import {useEffect,useState} from 'react';

/** Page state for a list of `total` rows; the page clamps back when the list shrinks. */
export function usePager(total:number,pageSize:number) {
  const [page,setPage]=useState(0);
  const pages=Math.max(1,Math.ceil(total/pageSize));
  useEffect(()=>{if(page>=pages)setPage(pages-1)},[page,pages]);
  return {page,setPage,pages,start:page*pageSize,end:page*pageSize+pageSize};
}
