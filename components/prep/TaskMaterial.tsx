"use client";
import { useId } from 'react';
import type { ReadingGraphic, ReadingTask } from '@/lib/prep/tasks';
import { completionInstruction, optionLabel } from '@/lib/prep/tasks';
import styles from './prep.module.css';

const gapText=(text:string)=>text.replace(/\{\{q(\d+)\}\}/g,'[$1] ______');
function wrap(text:string,size=24){return text.match(new RegExp('.{1,'+size+'}(?:\\s|$)|.{1,'+size+'}','g'))??[text];}

export function TaskMaterial({task,headings=false,zh=false}:{task:ReadingTask;headings?:boolean;zh?:boolean}){
  const marker=useId().replace(/:/g,'')+'arrow';
  const diagram=['diagram','flowchart'].includes(task.kind);
  const width=Math.max(1,...task.nodes.map(n=>n.x))*210+200;
  const height=Math.max(0,...task.nodes.map(n=>n.y))*120+108;
  return <section className={styles.taskMaterial} aria-label={task.title}>
    <h3>{task.title}</h3>
    <p className={styles.taskInstruction}>{task.options.length?(zh?'从共用选项中选择。':'Choose from the shared options. ')+(task.reuseOptions?(zh?'允许重复使用选项。':'You may reuse an option.'):(zh?'每个选项最多使用一次。':'Use each option at most once.')):completionInstruction(task.wordLimit,task.allowNumber)}</p>
    {task.content&&<p className={styles.taskText}>{gapText(task.content)}</p>}
    {task.kind==='table'&&<div className={styles.tableScroll}><table><caption>{task.title}</caption><thead><tr>{task.headers.map((h,i)=><th key={i} scope="col">{h}</th>)}</tr></thead><tbody>{task.rows.map((r,i)=><tr key={i}>{r.map((cell,j)=><td key={j}>{gapText(cell)}</td>)}</tr>)}</tbody></table></div>}
    {diagram&&<>
      <div className={styles.diagramScroll} tabIndex={0} aria-label={zh?'示意图，可横向滚动':'Diagram, horizontally scrollable'}>
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={task.title} style={{minWidth:Math.min(width,560)}}>
          <defs><marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/></marker></defs>
          {task.edges.map((edge,i)=>{const a=task.nodes.find(n=>n.id===edge.from),b=task.nodes.find(n=>n.id===edge.to);if(!a||!b)return null;
            const dx=b.x-a.x,dy=b.y-a.y;const vertical=Math.abs(dy)>=Math.abs(dx);
            const ax=a.x*210+100,ay=a.y*120+50,bx=b.x*210+100,by=b.y*120+50;
            const ox=vertical?0:Math.sign(dx)*84,oy=vertical?Math.sign(dy)*40:0;
            return <g key={i}><line x1={ax+ox} y1={ay+oy} x2={bx-ox} y2={by-oy} stroke="currentColor" strokeWidth="1.5" markerEnd={task.kind==='flowchart'?`url(#${marker})`:undefined}/>{edge.label&&<text x={(ax+bx)/2+5} y={(ay+by)/2-6} fontSize="11" fill="currentColor">{edge.label}</text>}</g>;
          })}
          {task.nodes.map(n=>{const lines=wrap(gapText(n.label));return <g key={n.id}><rect x={n.x*210+16} y={n.y*120+10} width="168" height="80" rx={task.kind==='flowchart'?10:2} fill="var(--surface)" stroke="currentColor"/>{lines.map((line,i)=><text key={i} x={n.x*210+100} y={n.y*120+49-(lines.length-1)*8+i*16} textAnchor="middle" fontSize="12" fill="currentColor">{line}</text>)}</g>;})}
        </svg>
      </div>
      <details><summary>{zh?'图的文字描述':'Text description of the diagram'}</summary><ul>{task.edges.map((e,i)=><li key={i}>{gapText(task.nodes.find(n=>n.id===e.from)?.label??'')} {task.kind==='flowchart'?'→':'—'} {gapText(task.nodes.find(n=>n.id===e.to)?.label??'')} {e.label&&'('+e.label+')'}</li>)}</ul></details>
    </>}
    {task.options.length>0&&<ol className={styles.sharedOptions}>{task.options.map((option,i)=><li key={i}><strong>{optionLabel(i,headings)}.</strong> {option}</li>)}</ol>}
  </section>;
}

export function DataGraphic({graphic:g,zh=false}:{graphic:ReadingGraphic;zh?:boolean}){
  const colors=['var(--foreground)','#477ca3','#bc7d47'];
  const values=g.rows.flatMap(r=>r.values),low=Math.min(0,...values),high=Math.max(0,...values),span=high-low||1;
  const y=(v:number)=>260-(v-low)/span*210;
  const x=(i:number)=>90+i*(460/Math.max(1,g.rows.length-1));
  return <figure className={styles.taskMaterial}>
    <figcaption>{g.title} · {g.unit}</figcaption>
    {g.kind!=='table'&&<div className={styles.diagramScroll}><svg viewBox="0 0 640 340" role="img" aria-label={g.title+' ('+g.unit+')'} style={{minWidth:440}}>
      {[0,1,2,3,4].map(i=>{const value=low+span*i/4;return <g key={i}><line x1="65" x2="590" y1={y(value)} y2={y(value)} stroke="var(--border)"/><text x="60" y={y(value)+4} textAnchor="end" fontSize="11" fill="currentColor">{Number(value.toPrecision(3))}</text></g>;})}
      <line x1="65" x2="590" y1={y(0)} y2={y(0)} stroke="currentColor"/>
      {g.series.map((series,j)=>g.kind==='line'?<polyline key={series} fill="none" stroke={colors[j]} strokeWidth="2" points={g.rows.map((r,i)=>`${x(i)},${y(r.values[j])}`).join(' ')}/>:null)}
      {g.rows.map((row,i)=><g key={row.label}>{row.values.map((value,j)=>g.kind==='bar'?<rect key={j} x={x(i)-24+j*48/g.series.length} y={Math.min(y(0),y(value))} width={42/g.series.length} height={Math.max(1,Math.abs(y(0)-y(value)))} fill={colors[j]}><title>{row.label} · {g.series[j]}: {value} {g.unit}</title></rect>:<circle key={j} cx={x(i)} cy={y(value)} r="4" fill={colors[j]}><title>{row.label} · {g.series[j]}: {value} {g.unit}</title></circle>)}{wrap(row.label,15).slice(0,3).map((line,k)=><text key={k} x={x(i)} y={279+k*14} fontSize="10" textAnchor="middle" fill="currentColor">{line}</text>)}</g>)}
    </svg><div className={styles.graphLegend}>{g.series.map((name,j)=><span key={name}><span style={{backgroundColor:colors[j]}}/> {name}</span>)}</div></div>}
    <div className={styles.tableScroll}><table><caption>{zh?'数据（含完整标签）':'Data with full labels'}</caption><thead><tr><th scope="col">{zh?'类别':'Category'}</th>{g.series.map(s=><th scope="col" key={s}>{s} ({g.unit})</th>)}</tr></thead><tbody>{g.rows.map(row=><tr key={row.label}><th scope="row">{row.label}</th>{row.values.map((v,i)=><td key={i}>{v}</td>)}</tr>)}</tbody></table></div>
  </figure>;
}
