import test from "node:test";
import assert from "node:assert/strict";
import {
 adminKeyMatches,makeSession,verifySession,readSessionCookie,isSameOrigin,
 COOKIE_NAME,COOKIE_LIFETIME_MS,cookieOptions
} from "../server/admin-session.js";

const key="never-store-this-plain-admin-key";
const now=Date.UTC(2026,9,10);
const fakeRequest=headers=>({get(name){return headers[name.toLowerCase()]||undefined}});

test("Signed admin session authenticates without exposing the administrator key",()=>{
 const token=makeSession(key,now);
 assert.equal(token.includes(key),false);
 assert.equal(verifySession(token,key,now+1000)?.refresh,false);
 assert.equal(cookieOptions.httpOnly,true);
 assert.equal(cookieOptions.secure,true);
 assert.equal(cookieOptions.sameSite,"strict");
 assert.equal(cookieOptions.path,"/");
 assert.equal(readSessionCookie("some=other; "+COOKIE_NAME+"="+token+"; other=ok"),token);
});

test("Session survives browser restart, refreshes after 1 day, expires after 90 days",()=>{
 const token=makeSession(key,now);
 assert.ok(verifySession(token,key,now+2*24*60*60*1000)?.refresh);
 assert.equal(verifySession(token,key,now+COOKIE_LIFETIME_MS+1),null);
 assert.equal(verifySession(token,"new-admin-key",now+1000),null);
 assert.equal(verifySession(token.replace(/.$/,"x"),key,now+1000),null);
});

test("Secret keys are compared safely and invalid values fail closed",()=>{
 assert.equal(adminKeyMatches(key,key),true);
 assert.equal(adminKeyMatches("bad",key),false);
 assert.equal(adminKeyMatches("",key),false);
 assert.equal(adminKeyMatches(undefined,key),false);
});
test("Cookie-powered privileged writes require same HTTPS origin",()=>{
 const hostname="micin-radar-web-production.up.railway.app";
 assert.equal(isSameOrigin(fakeRequest({"origin":"https://"+hostname,"host":hostname,"sec-fetch-site":"same-origin"})),true);
 assert.equal(isSameOrigin(fakeRequest({"origin":"https://attacker.example","host":hostname,"sec-fetch-site":"cross-site"})),false);
 assert.equal(isSameOrigin(fakeRequest({"origin":"https://"+hostname,"host":hostname,"sec-fetch-site":"same-site"})),false);
 assert.equal(isSameOrigin(fakeRequest({"origin":"http://"+hostname,"host":hostname,"sec-fetch-site":"same-origin"})),false);
 assert.equal(isSameOrigin(fakeRequest({"host":hostname})),false);
});
