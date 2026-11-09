// MCP Apps postMessage transport. Standalone website does not need a host.
if (window.parent !== window) {
  let hostReady=false, rpcId=1;
  const send=message=>window.parent.postMessage({jsonrpc:'2.0',...message},'*');
  const context=ctx=>{
    for(const [key,value] of Object.entries(ctx?.styles?.variables||{})) if(key.startsWith('--')&&typeof value==='string') document.documentElement.style.setProperty(key,value);
    const inset=ctx?.safeAreaInsets;
    if(inset) document.body.style.padding=[inset.top,inset.right,inset.bottom,inset.left].map(n=>Math.max(0,Number(n)||0)+'px').join(' ');
  };
  window.addEventListener('message',event=>{
    if(event.source!==window.parent||event.data?.jsonrpc!=='2.0')return;
    const message=event.data;
    if(message.id==='atlas-init'&&message.result){hostReady=true;context(message.result.hostContext);send({method:'ui/notifications/initialized'});}
    if(message.method==='ui/notifications/host-context-changed')context(message.params);
    if(message.method==='ping')send({id:message.id,result:{}});
    if(message.method==='ui/resource-teardown')send({id:message.id,result:{}});
  });
  send({id:'atlas-init',method:'ui/initialize',params:{protocolVersion:'2026-01-26',appInfo:{name:'技能图谱',version:'1.1.0'},appCapabilities:{availableDisplayModes:['fullscreen']}}});
  document.addEventListener('click',event=>{
    const a=event.target.closest('a[href]');
    if(!hostReady||!a||!/^https:\/\//.test(a.href))return;
    event.preventDefault();send({id:++rpcId,method:'ui/open-link',params:{url:a.href}});
  });
}
