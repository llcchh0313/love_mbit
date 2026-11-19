// 로컬 무의존 테스트: node check_consistency.js
const fs=require('fs'),vm=require('vm');
const context={window:{}};vm.createContext(context);
vm.runInContext(fs.readFileSync(__dirname+'/config.js','utf8'),context);
vm.runInContext(fs.readFileSync(__dirname+'/questions.js','utf8'),context);
vm.runInContext(fs.readFileSync(__dirname+'/shared.js','utf8'),context);
const {questions,calculate}=context.window.RVT;
const sql=fs.readFileSync(__dirname+'/supabase/setup.sql','utf8');
const found=sql.match(/v_directions\s+integer\[\]\s*:=\s*array\[([^\]]+)\]/);
if(!found)throw Error('SQL 방향 배열을 찾지 못했습니다');
const directions=found[1].split(',').map(x=>Number(x.trim()));
if(questions.length!==20||directions.length!==20)throw Error('문항 수가 20이 아님');
const axes=['F','O','I','S'];
for(let i=0;i<20;i++){
 const q=questions[i];
 if(q.axis!==axes[i%4]||directions[i]!== (q.axis===q.pole?1:-1)) throw Error('채점 방향 불일치 Q'+(i+1));
}
for(let t=0;t<10000;t++){
 const answers=Array.from({length:20},()=>1+Math.floor(Math.random()*5));
 const client=calculate(answers);
 const scores=[0,0,0,0];
 for(let i=0;i<20;i++)scores[i%4]+=(answers[i]-3)*directions[i];
 if(client.values.some((v,i)=>v.sum!==scores[i]))throw Error('합계 불일치');
 const type=(scores[0]>=0?'F':'B')+(scores[1]>=0?'O':'D')+(scores[2]>=0?'I':'C')+(scores[3]>=0?'S':'P');
 if(client.code!==type)throw Error('유형 불일치');
}
console.log('PASS: fixed 20 questions, balanced 5 per dimension, SQL and browser scoring consistent over 10000 cases.');
