import {test,expect,type Page} from '@playwright/test';
const user={id:'a20e5041-118e-4de0-b7b6-6ecf279c5b23',username:'PrepStudent',email:'prep@example.invalid',createdAt:'2026-09-23T00:00:00.000Z'};
const key='lumina.prep.v2.'+user.id;
const passage='Honeybees use a waggle dance to signal food locations. Longer waggle runs indicate greater distances. '.repeat(8);
function state(expired=false){const createdAt=Date.now();return {profiles:{},attempts:[],reviews:[],vocabulary:[],sets:{ielts:{exam:'ielts',createdAt,passage,types:['mcq'],set:{title:'Practice fixture',questions:Array.from({length:4},(_,i)=>({id:'q'+(i+1),type:'mcq',prompt:'What do longer runs indicate? '+(i+1),options:['Greater distances','Rain','Danger','Sleep'],answerIndex:0,answerText:'Greater distances',explanation:'The source states that duration indicates distance.',evidence:['Longer waggle runs indicate greater distances.'],strategy:'Find a supporting sentence.',optionReasons:['Directly stated.','Not stated.','Not stated.','Not stated.']}))},session:{answers:{},flags:[],submitted:false,startedAt:createdAt-60000,deadline:expired?createdAt-1:null}}}};}
async function account(page:Page,seed=state()){
  await page.route('**/api/auth',r=>r.fulfill({json:{user}}));
  await page.route('**/api/study-sessions',r=>r.fulfill({json:{userId:user.id,sessions:[],revisions:{},storage:'local'}}));
  await page.route('**/api/generation-jobs?*',r=>r.fulfill({json:{userId:user.id,jobs:[],nextCursor:null}}));
  await page.addInitScript(({key,seed})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed));},{key,seed});
}
test('autosaves answers, records first-attempt mistakes and keeps review notes through reload',async({page})=>{
  await account(page);await page.goto('/prep/ielts');
  await page.getByRole('radio',{name:'Rain',exact:true}).first().check();
  await page.getByRole('button',{name:'☆ Mark for review',exact:true}).nth(1).click();
  await page.reload();await expect(page.getByRole('radio',{name:'Rain',exact:true}).first()).toBeChecked();
  for(const option of (await page.getByRole('radio',{name:'Greater distances',exact:true}).all()).slice(1))await option.check();
  await page.getByRole('button',{name:'Check answers',exact:true}).click();
  await expect(page.getByText('3 / 4 correct',{exact:true})).toBeVisible();
  await expect(page.getByText(/Estimated band/)).toHaveCount(0);
  await expect(page.getByLabel('My correction note',{exact:true})).toHaveCount(2);
  await page.getByLabel('My correction note',{exact:true}).first().fill('I confused duration with direction.');
  await expect.poll(()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).reviews[0].note,key)).toBe('I confused duration with direction.');
  await page.reload();await page.getByLabel('My correction note',{exact:true}).first().waitFor();
  await expect(page.getByLabel('My correction note',{exact:true}).first()).toHaveValue('I confused duration with direction.');
  await expect(page.getByRole('radio',{name:'Rain',exact:true}).first()).toBeDisabled();
  await page.getByRole('button',{name:'Try again',exact:true}).click();
  for(const option of await page.getByRole('radio',{name:'Greater distances',exact:true}).all())await option.check();
  await page.getByRole('button',{name:'Check answers',exact:true}).click();
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).attempts.length,key)).toBe(1);
});
test('restored expired timer locks responses and counts unanswered items as missed',async({page})=>{
  await account(page,state(true));await page.goto('/prep/ielts');
  await expect(page.getByText('Time reached. Answers are locked; check your results.')).toBeVisible();
  await expect(page.getByRole('radio').first()).toBeDisabled();
  await page.getByRole('button',{name:'Check answers',exact:true}).click();
  await expect(page.getByText('0 / 4 correct',{exact:true})).toBeVisible();
});
test('cloud conflicts preserve local work and official 2026 guidance is available',async({page})=>{
  await account(page);
  await page.route('**/api/prep/progress',r=>r.fulfill({status:409,json:{code:'REVISION_CONFLICT',error:'Cloud practice changed. Export this device first, then load the cloud copy.'}}));
  await page.goto('/prep/ielts');
  await page.getByText('Storage, privacy and backups',{exact:true}).click();
  await page.getByRole('button',{name:'Save to cloud',exact:true}).click();
  await expect(page.getByText('Cloud practice changed. Export this device first, then load the cloud copy.')).toBeVisible();
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).sets.ielts.set.title,key)).toBe('Practice fixture');
  await page.goto('/prep/toefl');
  await page.getByText(/Exam requirements, strategies and official resources/).click();
  await expect(page.getByText(/Since January 21, 2026/)).toBeVisible();
  await expect(page.getByRole('combobox',{name:'Target Reading band (1–6)',exact:true})).toBeVisible();
  for(const theme of ['light','dark']){await page.evaluate(t=>document.documentElement.classList.toggle('dark',t==='dark'),theme);await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'.data/prep-'+theme+'-'+test.info().project.name+'.png',fullPage:true});}
});
test('guest cannot start a paid provider request and another account cannot see saved practice',async({page})=>{
  await page.addInitScript(({key,seed})=>localStorage.setItem(key,JSON.stringify(seed)),{key,seed:state()});
  await page.route('**/api/auth',r=>r.fulfill({json:{user:null}}));let calls=0;
  await page.route('**/api/prep/generate',r=>{calls++;return r.abort();});
  await page.goto('/prep/ielts');
  await expect(page.getByRole('heading',{name:'Practice fixture'})).toHaveCount(0);
  await page.getByRole('button',{name:'Create questions',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'Sign in to generate.'})).toBeVisible();expect(calls).toBe(0);
});

test('cloud save persists revisions and confirmed restore updates the practice and plan',async({page})=>{
  await account(page);
  const revisions:number[]=[];
  const remote={...state(),profiles:{ielts:{target:8,date:'2027-05-01',minutes:30}}};
  remote.sets.ielts.set.title='Cloud practice';
  await page.route('**/api/prep/progress',async route=>{
    if(route.request().method()==='GET')return route.fulfill({json:{revision:4,state:remote}});
    const data=route.request().postDataJSON();revisions.push(data.expectedRevision);
    await route.fulfill({json:{revision:data.expectedRevision+1}});
  });
  await page.goto('/prep/ielts');
  await page.getByText('Storage, privacy and backups',{exact:true}).click();
  await page.getByRole('button',{name:'Save to cloud',exact:true}).click();
  await expect(page.getByText('Done. Save to cloud again after making changes.',{exact:true})).toBeVisible();
  await page.reload();
  await page.getByText('Storage, privacy and backups',{exact:true}).click();
  await page.getByRole('button',{name:'Save to cloud',exact:true}).click();
  await expect(page.getByText('Done. Save to cloud again after making changes.',{exact:true})).toBeVisible();
  expect(revisions).toEqual([0,1]);
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Load cloud copy',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Cloud practice',exact:true})).toBeVisible();
  await expect(page.getByRole('combobox',{name:'Target band',exact:true})).toHaveValue('8');
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key+'.backup')!).sets.ielts.set.title,key)).toBe('Practice fixture');
  await page.getByText('Storage, privacy and backups',{exact:true}).click();
  await page.getByRole('button',{name:'Save to cloud',exact:true}).click();
  await expect.poll(()=>revisions).toEqual([0,1,4]);
});

test('vocabulary persists and JSON backup restores the saved practice',async({page})=>{
  await account(page);await page.goto('/prep/ielts');
  await page.getByText('Vocabulary in context',{exact:false}).click();
  await page.getByLabel('Word or phrase',{exact:true}).fill('waggle');
  await page.getByLabel('Meaning in context',{exact:true}).fill('move from side to side');
  await page.getByLabel('Source sentence / example',{exact:true}).fill('Bees use a waggle dance.');
  await page.getByRole('button',{name:'Save vocabulary',exact:true}).click();
  await page.reload();
  await page.getByText('Vocabulary in context',{exact:false}).click();
  await expect(page.getByText('waggle',{exact:true})).toBeVisible();
  await page.getByText('Storage, privacy and backups',{exact:true}).click();
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export JSON backup',exact:true}).click();
  const download=await downloadPromise;
  const backupPath=test.info().outputPath('prep-backup.json');await download.saveAs(backupPath);
  await page.getByRole('button',{name:'New passage',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Practice fixture',exact:true})).toHaveCount(0);
  page.once('dialog',dialog=>dialog.accept());
  await page.getByLabel('Restore a backup (replaces local records)',{exact:true}).setInputFiles(backupPath);
  await expect(page.getByRole('heading',{name:'Practice fixture',exact:true})).toBeVisible();
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).vocabulary[0].term,key)).toBe('waggle');
});
