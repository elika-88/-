import type { ExamId } from './exams';
type Text={en:string;zh:string};
export const SKILL_GROUPS:Partial<Record<ExamId,{name:Text;ids:string[]}[]>>={
  ielts:[
    {name:{en:'Claims and choices',zh:'判断与选择'},ids:['tfng','ynng','mcq','multi']},
    {name:{en:'Matching',zh:'匹配'},ids:['matching_info','heading','matching_features','sentence_endings']},
    {name:{en:'Completion and short answers',zh:'填空与简答'},ids:['completion','summary','notes','table','flowchart','diagram','short']},
  ],
  sat:[
    {name:{en:'Information and Ideas',zh:'信息与观点'},ids:['central','evidence','quantitative','inference']},
    {name:{en:'Craft and Structure',zh:'表达与结构'},ids:['words','structure','cross_text']},
    {name:{en:'Expression of Ideas',zh:'观点表达'},ids:['transitions','synthesis']},
    {name:{en:'Standard English Conventions',zh:'标准英语规范'},ids:['boundaries','form']},
  ],
};
export const SKILL_TIPS:Partial<Record<ExamId,Record<string,Text>>>={
  ielts:{
    tfng:{zh:'逐项核对主体、数量、时间和限定词。False 要有矛盾证据；仅找不到信息是 Not Given，不能凭常识判断。',en:'Check subject, quantity, time and qualifiers. False needs a contradiction; missing information is Not Given. Ignore outside knowledge.'},
    ynng:{zh:'找作者明确表达的观点。别人说的话不一定是作者立场；没有立场证据就不能推断 Yes 或 No。',en:'Locate the writer\'s position. A quoted person\'s claim need not be the writer\'s view; do not infer agreement without evidence.'},
    mcq:{zh:'先用自己的话回答，再比选项；排除偷换范围、绝对化和只对一半的选项。',en:'Predict an answer before comparing options. Reject changed scope, absolutes and half-true choices.'},
    multi:{zh:'逐项判断，每个选项都找证据；严格按要求选两项或三项，不因已找到一项而停止。',en:'Evaluate every option with evidence. Select exactly the requested two or three, in any order.'},
    matching_info:{zh:'先圈具体线索，再扫描段落。它考细节而不是主旨；按题目说明判断段落字母能否复用。',en:'Scan for specific details, not paragraph themes. Check whether paragraph letters may be reused.'},
    heading:{zh:'概括整段的主题与作用，警惕只概括例子的标题。标题有多余项，每个最多用一次。',en:'Summarize the whole paragraph and its purpose. Reject headings about only an example. Extra headings are distractors; no reuse.'},
    matching_features:{zh:'标出人名、年代或对象，再追踪其观点和代词指代。确认选项是否可以重复。',en:'Locate people, periods or objects, then track claims and pronoun references. Check the reuse rule.'},
    sentence_endings:{zh:'先读句首定位，再同时检查信息与语法。语法通顺不代表内容正确。',en:'Locate the sentence beginning, then test meaning and grammar. Grammatical fit alone is insufficient.'},
    completion:{zh:'先预测词性，再按原文取词；核对单复数、拼写和字数。连字符词算一个词。',en:'Predict the part of speech, copy source words and check spelling, number and the word limit. A hyphenated word counts as one.'},
    summary:{zh:'先读完整摘要，判断逻辑和词性，再定位对应段落。答案不一定按原文顺序出现。',en:'Read the whole summary for logic and grammar. Locate the relevant passage section; gaps need not follow source order.'},
    notes:{zh:'用笔记层级区分主旨和细节，保持同级项目语法一致；不要添加原文没有的词。',en:'Use note hierarchy to separate ideas and details. Keep parallel grammar; do not add unsupported words.'},
    table:{zh:'先读行列标题，确定比较维度，再填对应单元格；特别核对单位与对象。',en:'Read row and column headings first. Match each gap to its category, unit and source detail.'},
    flowchart:{zh:'顺着箭头追踪阶段，注意先后、条件和产物；答案须满足框内语法和字数。',en:'Follow arrows through stages, conditions and outputs. Check the grammar and limit for each box.'},
    diagram:{zh:'先确定部件与空间关系，再定位描述；不要凭图猜词或使用课外知识。',en:'Identify parts and spatial relations, then locate their description. Do not guess labels from outside knowledge.'},
    short:{zh:'只回答所问细节，不写完整句子；按原文取词，检查字数、数字和拼写。',en:'Answer only the requested detail, not a full sentence. Use source words and check numbers, spelling and limits.'},
  },
  sat:{
    central:{zh:'分清主张与例子，答案范围应覆盖文本又不夸大；细节题回到明确陈述。',en:'Separate the claim from examples. Match the scope of the text without overgeneralizing; verify details directly.'},
    evidence:{zh:'先写清要支持或反驳的结论，再找与它直接相关的证据，而不是只选同主题句子。',en:'Identify the claim to support or weaken. Choose evidence that directly changes its plausibility, not merely shares its topic.'},
    quantitative:{zh:'先读标题、单位、图例和类别，再核对趋势与比较。区分相关性和因果，不把没给出的数据当证据。',en:'Read title, units, legend and categories before comparing trends. Distinguish correlation from cause; use only displayed data.'},
    inference:{zh:'把结论限制在文本必然或强烈支持的范围内；不要选听起来合理但需要额外假设的答案。',en:'Choose a conclusion strongly supported by the text. Reject plausible answers that require extra assumptions.'},
    words:{zh:'先根据转折、因果和语气预测含义，再比较近义词的精确程度与搭配。',en:'Predict meaning from contrast, cause and tone, then compare precision and collocation.'},
    structure:{zh:'用“提出观点→举例→限定”等关系概括结构；问句子作用时看它如何推进整段。',en:'Map the sequence of claim, example and qualification. Judge a sentence by how it advances the text.'},
    cross_text:{zh:'分别概括两段立场，再找共同点、分歧或限定。不要把同主题误当同观点。',en:'Summarize each position, then compare agreement, disagreement or qualification. Shared topics need not mean shared claims.'},
    transitions:{zh:'先忽略选项，判断前后是转折、递进、例证还是因果；再选择逻辑一致的衔接词。',en:'Determine contrast, continuation, example or cause before inspecting transition choices.'},
    synthesis:{zh:'先读写作目标，只选择实现该目标的必要信息；不必把所有笔记都塞进句子。',en:'Read the rhetorical goal first. Select only notes needed to meet it, rather than trying to use every fact.'},
    boundaries:{zh:'先找完整主谓和独立分句，再决定句号、分号、冒号或逗号；不要仅凭停顿感。',en:'Identify subjects, verbs and independent clauses before choosing punctuation. Do not rely on perceived pauses.'},
    form:{zh:'找真正的主语与中心词，检查主谓一致、时态、代词指代和修饰语位置。',en:'Find the true subject and head noun. Check agreement, tense, pronoun reference and modifier placement.'},
  },
};

// Original practice source, not an official exam passage or a real research report.
export const SAMPLE_PASSAGE=`A fictional university garden tested three rainwater collectors during a teaching project. The aim was to compare water collection under similar conditions, not to demonstrate that any device would work equally well in every climate. The students placed the collectors beside one another and recorded the water gathered after each trial. Mira, the project coordinator, argued that simple equipment could make environmental measurement more accessible. Owen, a laboratory technician, cautioned that a short classroom trial could not establish long-term reliability.

Each collector had a funnel above a storage tank. A mesh filter sat inside the funnel and caught leaves before water entered the tank. A narrow pipe connected the bottom of the tank to a measuring cylinder positioned beside it. To take a measurement, students first cleared the filter, then opened a valve in the pipe, and finally read the scale on the cylinder. A lid covered the tank between measurements to reduce evaporation. The cylinder measured volume; it did not measure the purity of the water.

In the first trial, the Cedar collector gathered 12 litres, the Maple collector gathered 18 litres, and the Birch collector gathered 24 litres. In the second trial, Cedar gathered 15 litres, Maple gathered 21 litres, and Birch gathered 27 litres. All three collectors therefore gathered more water in the second trial. The increase was the same for each device, even though the total volumes differed. Because weather conditions also changed between trials, these results alone could not show that any modification caused the increase.

After reviewing the records, Mira proposed repeating the experiment over several months and inviting students to compare the results. Owen recommended checking the cylinder against a standard container before every trial. Their suggestions addressed different limitations: a longer study would reveal variation over time, while calibration would reduce measurement error. Both agreed that publishing the method alongside the results would help other classes interpret the evidence. The project illustrates why an attractive numerical pattern can be useful without proving a broad causal claim.`;
