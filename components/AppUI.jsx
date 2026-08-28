export function Modal({children,onClose}){return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:50,display:"flex",alignItems:"flex-end"}} onClick={e=>e.target===e.currentTarget&&onClose()}><div style={{background:"#FAF7F3",borderRadius:"24px 24px 0 0",width:"100%",maxWidth:430,margin:"0 auto",padding:"22px 20px 44px",boxShadow:"0 -8px 40px rgba(0,0,0,0.18)",maxHeight:"90vh",overflowY:"auto"}}>{children}</div></div>);}

export function Card({children,style}){return(<div style={{background:"white",borderRadius:18,padding:"18px",boxShadow:"0 2px 16px rgba(0,0,0,0.06)",...style}}>{children}</div>);}

export function SmLabel({children,style}){return(<p style={{margin:0,fontSize:10,color:"#8B7F72",letterSpacing:2,textTransform:"uppercase",...style}}>{children}</p>);}

export function BigVal({children,color}){return(<p style={{margin:"6px 0 0",fontSize:20,fontWeight:"bold",color,letterSpacing:-0.5}}>{children}</p>);}

export function Field({label,children}){return(<div style={{marginBottom:13}}><label style={{display:"block",fontSize:10,color:"#8B7355",letterSpacing:1.5,textTransform:"uppercase",marginBottom:5}}>{label}</label>{children}</div>);}

export function Div(){return(<div style={{height:1,background:"#E0D8CE",marginBottom:14}}/>);}

export function MS({label,value,color,f}){return(<div style={{flex:1,textAlign:"center"}}><p style={{margin:0,fontSize:9,color:"#AAA",letterSpacing:1.5,textTransform:"uppercase"}}>{label}</p><p style={{margin:"4px 0 0",fontSize:12,fontWeight:"bold",color}}>{f(value)}</p></div>);}

export function Pill({children,color,bg}){return(<span style={{background:bg,color,borderRadius:10,padding:"5px 14px",fontSize:13,fontWeight:"700"}}>{children}</span>);}

export function CloseBtn({onClick}){return(<button onClick={onClick} style={{background:"#EDEDE8",border:"none",borderRadius:50,width:32,height:32,fontSize:15,cursor:"pointer",color:"#555"}}>✕</button>);}

export function TogBtn({active,color,bg,onClick,children}){return(<button onClick={onClick} style={{flex:1,padding:"11px",borderRadius:12,border:`2px solid ${active?color:"#E0D8CE"}`,background:active?bg:"white",color:active?color:"#BBB",fontFamily:"inherit",fontSize:13,fontWeight:"600",cursor:"pointer"}}>{children}</button>);}

export function ChkBox({checked,onChange}){return(<div onClick={()=>onChange(!checked)} style={{width:22,height:22,borderRadius:6,border:`2px solid ${checked?"#1A3055":"#CCC"}`,background:checked?"#1A3055":"white",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}>{checked&&<span style={{color:"white",fontSize:13}}>✓</span>}</div>);}

export function MoneyIn({value,onChange,onBlur,placeholder}){return(<div style={{position:"relative"}}><span style={{position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",color:"#8B7F72",fontSize:14}}>R$</span><input value={value} onChange={e=>onChange(e.target.value.replace(/[^0-9,]/g,""))} onBlur={onBlur} inputMode="numeric" placeholder={placeholder} style={{width:"100%",background:"white",border:"1px solid #E0D8CE",borderRadius:12,padding:"12px 14px 12px 38px",fontSize:15,fontFamily:"inherit",color:"#1A1A1A",outline:"none",boxSizing:"border-box"}}/></div>);}
