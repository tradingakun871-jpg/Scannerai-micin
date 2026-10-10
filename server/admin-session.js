import {createHmac,randomBytes,timingSafeEqual,createHash} from "node:crypto";
const COOKIE="__Host-micin_admin";
const TTL_MS=90*24*60*60*1000;
const RENEW_AFTER_MS=24*60*60*1000;
const b64=s=>Buffer.from(s).toString("base64url");
const mac=(part,secret)=>createHmac("sha256",secret).update("micin-admin-v1:"+part).digest("base64url");
export function adminKeyMatches(actual,expected){
  if(typeof actual!=="string"||typeof expected!=="string"||!expected||actual.length>2048)return false;
  return timingSafeEqual(createHash("sha256").update(actual).digest(),createHash("sha256").update(expected).digest());
}
export function makeSession(secret,now=Date.now()){
  if(!secret)throw new Error("Admin key not configured");
  const payload=b64(JSON.stringify({v:1,iat:now,exp:now+TTL_MS,nonce:randomBytes(16).toString("hex")}));
  return payload+"."+mac(payload,secret);
}
export function verifySession(raw,secret,now=Date.now()){
  if(typeof raw!=="string"||raw.length>2000||!secret)return null;
  const parts=raw.split(".");
  if(parts.length!==2||!parts[0]||!parts[1])return null;
  const expected=mac(parts[0],secret);
  const one=Buffer.from(parts[1]),two=Buffer.from(expected);
  if(one.length!==two.length||!timingSafeEqual(one,two))return null;
  try{
    const data=JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8"));
    if(data.v!==1||!Number.isSafeInteger(data.iat)||!Number.isSafeInteger(data.exp)||data.iat>now+60000||
      now>=data.exp||data.exp-data.iat!==TTL_MS||typeof data.nonce!=="string"||!/^[0-9a-f]{32}$/.test(data.nonce))return null;
    return {issuedAt:data.iat,expiresAt:data.exp,refresh:now-data.iat>RENEW_AFTER_MS};
  }catch{return null}
}
export const COOKIE_NAME=COOKIE;
export const COOKIE_LIFETIME_MS=TTL_MS;
export const cookieOptions={httpOnly:true,secure:true,sameSite:"strict",path:"/",maxAge:TTL_MS};
export function readSessionCookie(header){
  if(typeof header!=="string")return null;
  const value=header.split(";").map(part=>part.trim()).find(part=>part.startsWith(COOKIE+"="));
  if(!value)return null;
  try{return decodeURIComponent(value.slice(COOKIE.length+1))}catch{return null}
}
export function isSameOrigin(req){
  const origin=req.get("Origin"),site=req.get("Sec-Fetch-Site");
  if(site&&site!=="same-origin")return false;
  if(!origin)return false;
  try{
    const parsed=new URL(origin);
    return parsed.protocol==="https:"&&parsed.host===req.get("host");
  }catch{return false}
}
