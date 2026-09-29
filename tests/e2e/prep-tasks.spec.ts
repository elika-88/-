import {test,expect,type Page} from '@playwright/test';
import {taskFixture,satFixture} from '../fixtures/prep-tasks';
import type {ReadingSet} from '../../lib/prep/schema';
const user={id:'a20e5041-118e-4de0-b7b6-6ecf279c5b23',username:'PrepStudent',email:'prep@example.invalid',createdAt:'2026-09-23T00:00:00.000Z'};
const key='lumina.prep.v2.'+user.id;
async function account(page:Page,exam='ielts',set?:ReadingSet,passage='Source for a local fixture.'){
  await page.route('**/api/auth',r=>r.fulfill({json:{user}}));
  await page.route('**/api/study-sessions',r=>r.fulfill({json:{userId:user.id,sessions:[],revisions:{},storage:'local'}}));
  await page.route('**/api/generation-jobs?*',r=>r.fulfill({json:{userId:user.id,jobs:[],nextCursor:null}}));
  if(set)await page.addInitScript(({key,exam,set,passage})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({profiles:{},attempts:[],reviews:[],vocabulary:[],sets:{[exam]:{exam,createdAt:1,passage,types:[set.questions[0].type],set,session:{answers:{},flags:[],submitted:false,startedAt:Date.now(),deadline:null}}}}));},{key,exam,set,passage});
}
test('IELTS heading choices prevent reuse and survive reload',async({page})=>{
  const {set,request}=taskFixture('heading');set.questions.forEach(q=>q.options=set.tasks![0].options);
  await account(page,'ielts',set,request.passage);await page.goto('/prep/ielts');
  const select=page.locator('#prep-q1 select');await select.selectOption('0');
  await expect(page.locator('#prep-q2 select option[value="0"]')).toHaveAttribute('disabled','');
  await page.reload();await expect(select).toHaveValue('0');
  await expect(page.locator('#prep-q2 select option[value="0"]')).toHaveAttribute('disabled','');
  for(let i=1;i<4;i++)await page.locator('#prep-q'+(i+1)+' select').selectOption(String(i));
  await page.getByRole('button',{name:'Check answers',exact:true}).click();
  await expect(page.getByText('4 / 4 correct',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(select).toHaveValue('');
  await expect(page.locator('#prep-q2 select option[value="0"]')).toBeEnabled();
});
test('multiple answers cap selections, grade partial credit and preserve review material',async({page})=>{
  const {set,request}=taskFixture('summary');set.tasks=[];
  set.questions=set.questions.map(q=>({...q,type:'multi',taskId:null,options:['First','Second','Third','Fourth','Fifth'],answerIndices:[0,1],answerIndex:-1,answerText:'A. First / B. Second'}));
  await account(page,'ielts',set,request.passage);await page.goto('/prep/ielts');
  const first=page.locator('#prep-q1');await first.getByRole('checkbox',{name:'First',exact:true}).check();await first.getByRole('checkbox',{name:'Third',exact:true}).check();
  await expect(first.getByRole('checkbox',{name:'Second',exact:true})).toBeDisabled();
  await page.reload();await expect(first.getByRole('checkbox',{name:'Third',exact:true})).toBeChecked();
  await page.getByRole('button',{name:'Check answers',exact:true}).click();
  await expect(page.getByText('1 / 8 points',{exact:true})).toBeVisible();
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).reviews[0].source,key)).toBe(request.passage);
});
for(const type of ['table','flowchart','diagram'])test(`IELTS ${type} is readable and restored in review`,async({page})=>{
  const {set,request}=taskFixture(type);await account(page,'ielts',set,request.passage);await page.goto('/prep/ielts');
  await expect(page.getByRole('region',{name:'Collector task'})).toBeVisible();
  await page.locator('#prep-q1 input').fill('wrong');
  for(const theme of ['light','dark']){
    await page.evaluate(t=>document.documentElement.classList.toggle('dark',t==='dark'),theme);
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.locator('#prep-q1').screenshot({path:'.data/'+type+'-'+theme+'-'+test.info().project.name+'.png'});
  }
  await page.getByRole('button',{name:'Check answers',exact:true}).click();
  await expect(page.getByRole('region',{name:'Collector task'})).toHaveCount(5);
  await page.reload();await expect(page.getByRole('region',{name:'Collector task'})).toHaveCount(5);
});
test('SAT graphics display full data labels and survive missed-question review',async({page})=>{
  const {set,request}=satFixture();await account(page,'sat',set,request.passage);await page.goto('/prep/sat');
  const first=page.locator('#prep-q1');await expect(first.getByRole('img')).toBeVisible();
  await expect(first.getByRole('table')).toContainText('Cedar');await expect(first.getByRole('table')).toContainText('12');
  await first.getByRole('radio',{name:'Cedar gathered the most.',exact:true}).check();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await first.screenshot({path:'.data/sat-graphic-'+test.info().project.name+'.png'});
  await page.getByRole('button',{name:'Check answers',exact:true}).click();
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).reviews[0].question.graphic.rows.length,key)).toBe(3);
});
test('skill picker covers all families and prevents impossible question counts',async({page})=>{
  await account(page);await page.goto('/prep/ielts');
  for(const name of ['True / False / Not Given','Multiple choice','Sentence completion'])await page.getByRole('checkbox',{name,exact:true}).uncheck();
  await page.getByRole('combobox',{name:'Questions',exact:true}).selectOption('4');
  await page.getByRole('checkbox',{name:'Matching headings',exact:true}).check();
  await page.getByRole('checkbox',{name:'Summary completion',exact:true}).check();
  await expect(page.getByRole('checkbox',{name:'Diagram label completion',exact:true})).toBeDisabled();
  await page.getByRole('combobox',{name:'Questions',exact:true}).selectOption('6');
  await page.getByRole('checkbox',{name:'Diagram label completion',exact:true}).check();
  await expect(page.getByRole('combobox',{name:'Questions',exact:true}).getByRole('option',{name:'4',exact:true})).toHaveAttribute('disabled','');
  await expect(page.locator('fieldset input[type="checkbox"]')).toHaveCount(15);
  await page.getByRole('button',{name:/Use original sample/}).click();
  await expect(page.getByLabel('Passage',{exact:true})).toHaveValue(/Cedar/);
  await page.goto('/prep/sat');await expect(page.locator('fieldset input[type="checkbox"]')).toHaveCount(11);
  for(const name of ['Information and Ideas','Craft and Structure','Expression of Ideas','Standard English Conventions'])await expect(page.getByRole('group',{name,exact:true})).toBeVisible();
});
test('numeric evidence preflight avoids a paid request when the source has no data',async({page})=>{
  await account(page,'sat');let calls=0;
  await page.route('**/api/prep/generate',route=>{calls++;return route.abort();});
  await page.goto('/prep/sat');
  await page.getByLabel('Passage',{exact:true}).fill('Researchers observed the equipment during a field study. The team described how the collection process worked and discussed the limits of the observations. '.repeat(3));
  await page.getByRole('checkbox',{name:'Words in context',exact:true}).uncheck();
  await page.getByRole('checkbox',{name:'Quantitative evidence',exact:true}).check();
  await page.getByRole('button',{name:'Create questions',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'Quantitative evidence needs at least two source numbers'})).toBeVisible();
  expect(calls).toBe(0);
});
