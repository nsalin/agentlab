/* Agent Lab: decides what to build for an AI coding assistant and writes the files, all in the browser. */
const ICON_COPY = 'Copy', ICON_DL = 'Download';
function esc(s){
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function showError(message){
  document.getElementById("status").textContent=message;
  console.error(message);
}
async function copyText(text, btn){
  try{
    await navigator.clipboard.writeText(text);
    document.getElementById("status").textContent="";
    const previous=btn.textContent;
    btn.textContent="Copied";
    setTimeout(()=>{btn.textContent=previous;},1200);
  }catch(error){
    showError("Copy failed. Select and copy the preview manually, or use Download. " + error.message);
  }
}
function agentFilename(){
  const field=document.getElementById("agFile");
  const name=field.value.trim();
  const valid=/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name);
  field.setCustomValidity(valid ? "" : "Use letters, digits, hyphens and underscores, without an extension.");
  const status=document.getElementById("status");
  if(valid && status.textContent==="Enter a valid file name before downloading.") status.textContent="";
  return valid ? fileName(piecePath(builderType(), name)) : null;
}
function fileName(path){ return path.slice(path.lastIndexOf("/")+1); }
function downloadText(name,text,mime){
  if(!name){
    document.getElementById("agFile").reportValidity();
    showError("Enter a valid file name before downloading.");
    return;
  }
  document.getElementById("status").textContent="";
  const url=URL.createObjectURL(new Blob([text],{type:mime||"text/markdown"}));
  const a=document.createElement("a");
  a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
/* One role drives the page: examples follow its perspective, and Create opens that role's usual document.
   Create's own select changes only the document, so the role is never lost. */
const DOC_FOR_PERSPECTIVE={engineer:"agent",business:"brief",manager:"approval"};
function setUserRole(role){
  if(!MENTOR_ROLES[role]) return;
  const perspective=MENTOR_ROLES[role].perspective;
  document.body.dataset.role=perspective;
  ["userRole","suRole","s0Role"].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=role; });
  chooseDocument(DOC_FOR_PERSPECTIVE[perspective]);
  rememberChoices();
  applyRoleExamples(); orderCatalogGroups(); renderNeed(); renderSetup();
}
/* The AI coding assistant the files are written for. Each one has its own folders and file format;
   the answers and the builder settings stay the same when it changes. */
const TOOLS = {
  copilot:{label:"GitHub Copilot", short:"Copilot"},
  claude:{label:"Claude Code", short:"Claude Code"},
  codex:{label:"OpenAI Codex", short:"Codex"},
};
function currentTool(){ return TOOLS[document.body.dataset.tool] ? document.body.dataset.tool : "copilot"; }
function setTool(tool, announce){
  if(!TOOLS[tool]) return;
  document.body.dataset.tool=tool;
  ["userTool","s0Tool"].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=tool; });
  document.querySelectorAll("[data-tool-label]").forEach(el=>{ el.textContent=TOOLS[tool].label; });
  document.querySelectorAll("[data-tool-short]").forEach(el=>{ el.textContent=TOOLS[tool].short; });
  document.querySelectorAll("[data-for-tool]").forEach(el=>{ el.hidden=!el.dataset.forTool.split(" ").includes(tool); });
  renderToolText();
  rememberChoices();
  renderNeed(); renderAgent(); renderCreateFiles(); renderScope(); renderSetup();
  const live=document.getElementById("liveStatus");
  if(live && announce) live.textContent=`Files and install steps now follow ${TOOLS[tool].label}.`;
}
const MAKE_IDS={agent:"makeAgent", brief:"makeBrief", approval:"makeApproval"};
function chooseDocument(doc){
  if(!MAKE_IDS[doc]) return;
  document.body.dataset.doc=doc;
  const choice=document.getElementById(MAKE_IDS[doc]);
  if(choice) choice.checked=true;
}
function go(section){
  const selected=["build","setup"].includes(section) ? section : "custom";
  document.querySelectorAll(".doc-section").forEach(s=>s.classList.toggle("on",s.id===selected));
  document.querySelectorAll("nav a").forEach(a=>{
    if(a.hash==="#"+selected) a.setAttribute("aria-current","page");
    else a.removeAttribute("aria-current");
  });
  // An empty address already means Explore; adding it on load would take focus from the About dialog.
  if(location.hash!=="#"+selected && (location.hash || selected!=="custom")) location.hash=selected;
  window.scrollTo(0,0);
  if(selected==="build") syncCreate();
}
function goToSetting(id){
  go("setup");
  const el=document.getElementById(id);
  if(el){ el.scrollIntoView({block:"center"}); el.focus({preventScroll:true}); }
}
function toggleTheme(){
  const dark=document.body.classList.toggle("theme-dark");
  const button=document.getElementById("themeBtn");
  button.setAttribute("aria-pressed",String(dark));
  button.setAttribute("title",dark ? "Switch to light theme" : "Switch to dark theme");
}
/* A native modal dialog: the browser handles Escape, keeps focus inside and returns it afterwards.
   On a first visit, closing it moves focus to the New here card instead. */
let aboutReturn="";
function openAbout(returnTo){
  const dialog=document.getElementById("aboutDialog"); if(!dialog) return;
  aboutReturn=typeof returnTo==="string" ? returnTo : "";
  if(typeof dialog.showModal==="function"){ if(!dialog.open) dialog.showModal(); }
  else dialog.setAttribute("open","");
}
function closeAbout(){
  const dialog=document.getElementById("aboutDialog"); if(!dialog) return;
  if(typeof dialog.close==="function") dialog.close();
  else { dialog.removeAttribute("open"); aboutClosed(); }
}
function aboutClosed(){
  if(!aboutReturn) return;
  document.getElementById(aboutReturn)?.focus();
  aboutReturn="";
}
/* The browser keeps only that the welcome card was shown and, if the user ticks "Remember",
   their role, time in role and assistant. Answers are never stored. */
// The keys keep the app's earlier name, so returning users keep what they chose.
const WELCOME_KEY="agentWorkshop.welcomed", REMEMBER_KEY="agentWorkshop.remembered";
let remembering=false;
function browserStore(){
  try{
    const store=window.localStorage;
    store.getItem(WELCOME_KEY);
    return store;
  }catch(error){
    return null;
  }
}
function storeSet(key,value){
  const store=browserStore();
  if(!store) return;
  try{ store.setItem(key,value); }catch(error){ return; }
}
function rememberChoices(){
  if(!remembering) return;
  storeSet(REMEMBER_KEY,JSON.stringify({
    role:document.getElementById("userRole").value, band:document.getElementById("suBand").value, tool:currentTool() }));
}
function restoreRemembered(){
  const store=browserStore(), raw=store ? store.getItem(REMEMBER_KEY) : null;
  if(!raw) return;
  try{
    const saved=JSON.parse(raw);
    remembering=true;
    if(MENTOR_BANDS[saved.band]) document.getElementById("suBand").value=saved.band;
    syncSmallestDefault();
    if(TOOLS[saved.tool]) setTool(saved.tool);
    setUserRole(MENTOR_ROLES[saved.role] ? saved.role : "developer");
    const box=document.getElementById("suRemember"); if(box) box.checked=true;
  }catch(error){
    forgetBrowser();
  }
}
function forgetBrowser(){
  remembering=false;
  const box=document.getElementById("suRemember"); if(box) box.checked=false;
  const store=browserStore();
  if(store){ try{ store.removeItem(REMEMBER_KEY); }catch(error){ return; } }
}
/* Setup's Remember box: ticking it saves the current choices, unticking forgets them. */
function rememberChanged(on){
  if(!on) return forgetBrowser();
  remembering=true;
  rememberChoices();
}
/* Shown once per browser, and only when the page opens without a requested section.
   A first visit opens the About dialog over the card, using the same stored flag. */
function showStepZero(canShow){
  const store=browserStore();
  if(!canShow || !store || store.getItem(WELCOME_KEY)) return;
  storeSet(WELCOME_KEY,"1");
  document.getElementById("s0Role").value=document.getElementById("userRole").value;
  document.getElementById("s0Tool").value=currentTool();
  document.getElementById("stepZero").hidden=false;
  openAbout("s0Role");
}
function startStepZero(){
  const band=document.getElementById("s0Band").value;
  if(MENTOR_BANDS[band]) document.getElementById("suBand").value=band;
  remembering=document.getElementById("s0Remember").checked;
  const box=document.getElementById("suRemember"); if(box) box.checked=remembering;
  syncSmallestDefault();
  setTool(document.getElementById("s0Tool").value);
  setUserRole(document.getElementById("s0Role").value);
  if(band==="lt2") document.getElementById("ndExamples").open=true;
  closeStepZero();
}
function closeStepZero(){
  document.getElementById("stepZero").hidden=true;
  document.getElementById("ndPain").focus();
}
window.addEventListener("hashchange",()=>go(location.hash.slice(1)));

/* ---------------- Tool catalogue ----------------
   One definition feeds question 6, the Agent Builder, the brief and the approval record. People tick
   the tools their work uses; except programming languages, each tool can also be reached "via MCP".
   Only MCP tools are granted in the generated files, and only they get a read-only reader.
   A category says what its tools hold, where to start, which changes need approval and what to
   return; a tool overrides only what differs. "local" tools live in the repository itself. */
const CI_TEXT = {what:"builds", local:false,
  use:"pipeline and build results, stages, parameters, test results, log lines and the commit that was built",
  start:"the job or pipeline name and the build number, or the build link",
  change:"starting, stopping, re-running or cancelling builds, and changing pipeline configuration",
  give:"the build link, its result, the failing stage and the few log lines that explain it"};
const CATALOG_GROUPS = [{id:"code", name:"Code"}, {id:"team", name:"Teamwork"}];
const CATALOG = [
  {id:"scm", group:"code", name:"Source control", short:"source control", other:"Other source control",
    help:"Repositories, branches and pull requests", what:"code and pull requests",
    use:"commits, diffs, pull requests and their comments, and the build status of a commit",
    start:"the repository and branch, the pull request number or the commit hash",
    change:"commenting on, approving, declining or merging pull requests, and creating branches, tags or webhooks",
    give:"links to the commits or pull request, the files changed and a short summary of the change",
    items:[["github","GitHub",{aliases:["gh"]}],["gitlab","GitLab"],["bitbucket","Bitbucket"],
      ["azure-repos","Azure Repos",{server:"azure-devops", aliases:["ado","azure devops"]}]]},
  {id:"build", group:"code", name:"Build and CI/CD", short:"build and CI/CD", other:"Other build and CI/CD tools",
    help:"Build tools, containers and pipelines", what:"build tool", local:true,
    use:"modules, tasks, dependencies and versions, and the output of a build",
    start:"the module or project and the task or command",
    change:"running builds, changing build files, and publishing packages",
    give:"the task or command used, its result and the few lines that explain a failure",
    items:[["maven","Maven",{aliases:["mvn"]}],["gradle","Gradle"],["npm","npm",{aliases:["node"]}],["vite","Vite"],["webpack","Webpack"],
      ["dotnet",".NET CLI / MSBuild",{short:".NET Build", server:"dotnet", aliases:["dotnet","msbuild"]}],
      ["docker","Docker",{aliases:["container","containers"], what:"containers", use:"images, containers, their status and logs",
        start:"the image or container name and the environment",
        change:"building, pushing, starting, stopping or removing images and containers",
        give:"the image or container, its status and the few log lines that matter"}],
      ["jenkins","Jenkins",CI_TEXT],["github-actions","GitHub Actions",{...CI_TEXT, server:"github", aliases:["gha","actions"]}],
      ["gitlab-ci","GitLab CI/CD",{...CI_TEXT, short:"GitLab CI", server:"gitlab"}],
      ["azure-pipelines","Azure Pipelines",{...CI_TEXT, server:"azure-devops", aliases:["ado","azure devops"]}],
      ["circleci","CircleCI",CI_TEXT]]},
  {id:"test", group:"code", name:"Testing tools", short:"testing", other:"Other testing tools",
    help:"Frameworks, runners and test reports", what:"tests", local:true,
    use:"test code, test runs and their results",
    start:"the test class, file or tag, and the environment",
    change:"changing tests or test data, and running tests against shared environments",
    give:"the tests run, their result, and the message and location of each failure",
    items:[["playwright","Playwright",{aliases:["browser","e2e"], what:"browser",
        use:"opening a page, reading what it shows, checking an element, console and network messages, and screenshots",
        start:"the environment or URL, the user role to sign in with and the steps to follow, never a password typed in chat",
        change:"submitting forms or clicking anything that creates, changes or deletes data",
        give:"the steps taken, what the page showed and any console or network errors"}],
      ["selenium","Selenium"],["cypress","Cypress"],["junit","JUnit"],["testng","TestNG"],["cucumber","Cucumber",{aliases:["bdd","gherkin"]}],
      ["postman","Postman",{aliases:["api"], what:"API collections", local:false,
        use:"requests, collections, environments and the results of collection runs",
        start:"the workspace, collection or request name, and the environment",
        change:"creating, editing or deleting requests, collections or environments, and running collections against shared environments",
        give:"the request or collection, the response status and the fields asked for, with tokens removed"}],
      ["appium","Appium",{aliases:["mobile"], what:"mobile app tests"}],["nunit","NUnit / xUnit",{short:"NUnit", server:"nunit", aliases:["xunit"]}],
      ["spock","Spock"],["rest-assured","REST Assured",{aliases:["restassured","api"], what:"API tests"}],
      ["jmeter","JMeter",{aliases:["load","performance"], what:"load tests"}],
      ["allure","Allure Report",{short:"Allure", server:"allure", aliases:["reports"], what:"test reports", local:false,
        use:"the results of a test run: failed tests, failure categories, steps, screenshots and history",
        start:"the CI job and build number or the report link, and the test name if known",
        change:"deleting or changing reports",
        give:"each failed test with its category, the key error line and a link to the report"}]]},
  {id:"logs", group:"code", name:"Logs and monitoring", short:"logs and monitoring", other:"Other logs and monitoring tools",
    help:"Logs, metrics, errors and traces", what:"logs",
    use:"application errors, request traces and the timeline around an incident",
    start:"the environment, the service or index, an exact time window with its time zone, and an ID to follow, such as a request or correlation ID",
    change:"creating or changing saved searches, alerts or dashboards",
    give:"the search used, its time window, the number of events and a short timeline with tokens and personal data removed",
    items:[["splunk","Splunk"],["grafana-loki","Grafana Loki",{server:"grafana", aliases:["grafana","loki"]}],
      ["elastic","Elastic Stack (ELK)",{short:"Elastic", server:"elasticsearch", aliases:["elk","elasticsearch","kibana","logstash"]}],
      ["datadog","Datadog"],["cloudwatch","AWS CloudWatch",{short:"CloudWatch", aliases:["aws"]}],["newrelic","New Relic"],
      ["azure-monitor","Azure Monitor",{aliases:["app insights","application insights"]}],
      ["sentry","Sentry",{what:"errors", use:"errors and their stack traces, releases, affected users and how often each error happens"}],
      ["dynatrace","Dynatrace"]]},
  {id:"sql", group:"code", name:"Database (SQL)", short:"database", other:"Other SQL databases",
    help:"Relational databases", what:"SQL database",
    use:"the state of the data, such as whether a record exists, its status or a count, and the structure of tables",
    start:"the environment, the table or record and its identifiers, and a time window",
    change:"running anything other than a SELECT query, such as INSERT, UPDATE, DELETE, DDL or stored procedures",
    give:"the query used, the row count and only the columns needed, with personal data masked",
    items:[["postgresql","PostgreSQL",{server:"postgres", aliases:["postgres","pg"]}],["mysql","MySQL",{aliases:["mariadb"]}],
      ["oracle","Oracle",{aliases:["pl/sql","plsql"], change:"running anything other than a SELECT query, such as INSERT, UPDATE, DELETE, DDL or PL/SQL"}],
      ["sqlserver","Microsoft SQL Server",{short:"SQL Server", server:"mssql", aliases:["mssql","t-sql","tsql"]}],["sqlite","SQLite"]]},
  {id:"nosql", group:"code", name:"Database (NoSQL)", short:"database", other:"Other NoSQL databases",
    help:"Document, key-value, column and graph stores", what:"NoSQL database",
    use:"documents, keys or records and their current state, and how collections or tables are structured",
    start:"the environment, the collection, table or key and its identifiers, and a time window",
    change:"inserting, updating or deleting data, and changing indexes, schemas or settings",
    give:"the query or key used, the number of results and only the fields needed, with personal data masked",
    items:[["mongodb","MongoDB",{aliases:["mongo"]}],["redis","Redis",{aliases:["cache"]}],
      ["cassandra","Apache Cassandra",{short:"Cassandra"}],["dynamodb","Amazon DynamoDB",{short:"DynamoDB", aliases:["dynamo","aws"]}],
      ["cosmosdb","Azure Cosmos DB",{short:"Cosmos DB", aliases:["cosmos"]}],["neo4j","Neo4j",{aliases:["graph","cypher"], what:"graph database"}],
      ["couchbase","Couchbase"],["firestore","Google Firestore",{short:"Firestore", aliases:["firebase"]}],
      ["elasticsearch","Elasticsearch",{aliases:["elastic","opensearch"], what:"search index",
        use:"documents in search indexes, their mappings and how many match a query"}]]},
  {id:"lang", group:"code", name:"Programming language", short:"language", other:"Other languages", noMcp:true, local:true,
    help:"The code in your repository. Your AI tool reads it directly, so there is no MCP option.", what:"programming language",
    items:[["python","Python",{aliases:["py"]}],["javascript","JavaScript",{aliases:["js","node"]}],["typescript","TypeScript",{aliases:["ts"]}],
      ["java","Java"],["csharp","C#",{aliases:["c sharp","dotnet",".net"]}],["go","Go",{aliases:["golang"]}],["kotlin","Kotlin"],
      ["swift","Swift"],["groovy","Groovy"]]},
  {id:"tracker", group:"team", name:"Story tracker", short:"story tracker", other:"Other story trackers",
    help:"Issues, stories and boards", what:"issues and stories",
    use:"descriptions, acceptance criteria, status and history, comments, links, sprints and releases",
    start:"the issue key or link, or search words or a saved query",
    change:"creating, editing, transitioning, assigning, linking, commenting on or deleting issues, and logging work",
    give:"the issue key with its link, its status and the fields asked for",
    items:[["jira","Jira",{aliases:["atlassian"], start:"the issue key, for example ABC-123, or search words or a JQL query"}],
      ["azure-boards","Azure Boards",{server:"azure-devops", what:"work items", aliases:["ado","azure devops","work items"]}],
      ["github-issues","GitHub Issues & Projects",{short:"GitHub Issues", server:"github"}],
      ["linear","Linear"],["trello","Trello",{what:"boards and cards"}],["asana","Asana",{what:"tasks and projects"}],
      ["gitlab-issues","GitLab Issues",{server:"gitlab"}]]},
  {id:"docs", group:"team", name:"Documentation", short:"documentation", other:"Other documentation tools",
    help:"Specifications, how-tos and decisions", what:"documentation",
    use:"specifications, requirements, how-to pages, decisions and release notes",
    start:"the page link, or the space and search words",
    change:"creating, editing, moving, labelling, commenting on or deleting pages",
    give:"the page title, link and last update date, quoting the exact wording that matters",
    items:[["confluence","Confluence",{aliases:["atlassian","wiki"]}],["notion","Notion"],
      ["sharepoint","SharePoint",{aliases:["microsoft","onedrive"], what:"files and team sites", use:"documents, lists and pages in team sites",
        start:"the site or file link, or search words", change:"uploading, editing, moving, sharing or deleting files",
        give:"the file name, link and last change date, with the relevant excerpt"}],
      ["markdown","Markdown in the repo / Wiki",{short:"Wiki", server:"wiki", local:true, aliases:["readme","md","wiki"]}],
      ["onenote","OneNote",{aliases:["microsoft"], what:"notes"}]]},
  {id:"testmgmt", group:"team", name:"Test management", short:"test management", other:"Other test management tools",
    help:"Test cases, cycles and results", what:"test cases and runs",
    use:"test cases and their steps, test cycles, latest results and the issues they cover",
    start:"the project, the test case, cycle or run key, or the issue key",
    change:"creating or changing test cases, steps, cycles or results, and importing tests",
    give:"the keys with links, the latest result of each case and any gaps in coverage",
    items:[["zephyr","Zephyr Scale",{short:"Zephyr", aliases:["zephyr"]}],["testrail","TestRail"],["xray","Xray"],
      ["azure-test-plans","Azure Test Plans",{server:"azure-devops", aliases:["ado","azure devops"]}],["qtest","qTest"],["testlink","TestLink"]]},
  {id:"comms", group:"team", name:"Communication", short:"communication", other:"Other communication tools",
    help:"Email, chat and meetings", what:"chats and channels",
    use:"discussions and decisions in channels and chats, and meeting details",
    start:"the channel or chat, search words and a date range",
    change:"posting, replying, reacting, and creating chats or meetings",
    give:"the channel or chat, the author, the date and a short quote",
    items:[["slack","Slack",{aliases:["chat"]}],["teams","Microsoft Teams",{short:"Teams", aliases:["ms teams","chat"]}],
      ["outlook","Outlook",{aliases:["email","mail","calendar","microsoft"], what:"email and calendar",
        use:"emails, threads and meetings about the task: decisions, dates and attachments",
        start:"the sender, words from the subject and a date range",
        change:"sending, replying to, forwarding, moving or deleting email, and creating or answering meeting invitations",
        give:"the subject, sender and date with a short quote, never whole emails"}]]},
  {id:"design", group:"team", name:"Design", short:"design", other:"Other design tools",
    help:"Screens, components and specs", what:"designs",
    use:"frames, components, styles, text and layout of a design, and a screenshot of a frame",
    start:"the link to the file or frame",
    change:"editing the design or adding comments",
    give:"the frame or component name, its link and the exact values asked for, such as sizes, colours and text",
    items:[["figma","Figma"],["sketch","Sketch"],
      ["zeplin","Zeplin",{what:"design specs", use:"screens, components, measurements, colours and assets handed off for development",
        start:"the project and screen link", change:"editing screens or adding notes and comments",
        give:"the screen or component name, its link and the specs asked for"}],
      ["penpot","Penpot"],["framer","Framer"],["adobe-xd","Adobe XD",{short:"XD", aliases:["xd","adobe"]}],["canva","Canva"],
      ["balsamiq","Balsamiq",{what:"wireframes", aliases:["wireframe"]}],["axure","Axure RP",{short:"Axure", what:"prototypes", aliases:["prototype"]}]]},
  {id:"diagrams", group:"team", name:"Diagrams", short:"diagrams", other:"Other diagram tools",
    help:"Flows and architecture", what:"diagrams",
    use:"process flows, architecture and sequence diagrams: their shapes, labels and connections",
    start:"the document link or name",
    change:"creating, editing or sharing diagrams",
    give:"the diagram name and link, and the steps or components that answer the question",
    items:[["lucidchart","Lucidchart",{aliases:["lucid"]}],["drawio","draw.io (diagrams.net)",{short:"draw.io", server:"drawio", aliases:["diagrams.net","drawio"]}],
      ["miro","Miro",{what:"whiteboards", aliases:["whiteboard"]}],["visio","Microsoft Visio",{short:"Visio", aliases:["visio"]}],
      ["mermaid","Mermaid",{local:true}]]},
  {id:"incidents", group:"team", name:"Incidents & on-call", short:"incidents", other:"Other incident tools",
    help:"Incidents, alerts and on-call", what:"incidents and on-call",
    use:"incidents with their status, timeline and notes, the services affected and who is on call",
    start:"the incident number or link, the service and a time window",
    change:"acknowledging, resolving, reassigning, escalating or creating incidents, adding notes and changing schedules",
    give:"the incident number and link, its status and a timeline that states the time zone",
    items:[["pagerduty","PagerDuty"],["opsgenie","Opsgenie"],["servicenow","ServiceNow",{what:"incidents and tickets", aliases:["itsm"]}]]},
  {id:"else", group:"", name:"Something else", short:"other tool", other:"Other tools", help:"Any other tool your team uses", items:[]},
];
const ITEMS = {}, CATS = {};
CATALOG.forEach(cat=>{
  CATS[cat.id]=cat;
  cat.items=cat.items.map(([id,name,extra])=>(ITEMS[id]={...(extra||{}), id, name, cat:cat.id}));
});
const CAT_ORDER = CATALOG.map(cat=>cat.id);
/* A ticked tool as answers and configurations keep it: {id, name, cat, mcp}. "Other" tools get an id from their name. */
function catalogEntry(id, mcp){
  const item=ITEMS[id]; if(!item) return null;
  return {id, name:item.name, cat:item.cat, mcp:!CATS[item.cat].noMcp && !!mcp};
}
function otherEntry(catId, name, mcp){
  const cat=CATS[catId], clean=cleanOtherName(name);
  if(!cat || !clean) return null;
  return {id:`other:${catId}:${slugify(clean,"tool")}`, name:clean, cat:catId, mcp:!cat.noMcp && !!mcp};
}
function cleanOtherName(name){ return String(name||"").replace(/\s+/g," ").trim().slice(0,40); }
function validServer(id){ return typeof id==="string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id); }
/* One page-wide map of MCP server IDs, edited in the Agent Builder and the approval record.
   A vendor's tools share one default server (github, gitlab, azure-devops); the rest use the slug of their name. */
const serverIds = {};
function defaultServer(e){ const item=ITEMS[e.id]; return item?.server || slugify(item?.name||e.name,"server"); }
function serverOf(e){ return validServer(serverIds[e.id]) ? serverIds[e.id] : defaultServer(e); }
function entryInfo(e){
  const cat=CATS[e.cat]||{}, item=ITEMS[e.id]||{};
  const pick=key=>item[key]??cat[key]??"";
  return {name:e.name, short:item.short||e.name, what:pick("what"), use:pick("use"), start:pick("start"),
    change:pick("change"), give:pick("give"), local:!!pick("local"), catName:cat.name||"Other", catShort:cat.short||"other tool"};
}
function entryLabel(e){ return e.mcp ? `${e.name} via MCP` : e.name; }
function sortEntries(entries){
  const rank=e=>{
    const item=ITEMS[e.id], cat=CATS[e.cat];
    return CAT_ORDER.indexOf(e.cat)*1000+(item && cat ? cat.items.indexOf(item) : 999);
  };
  return [...entries].sort((a,b)=>rank(a)-rank(b));
}
function andList(items){ return items.length>1 ? `${items.slice(0,-1).join(", ")} and ${items[items.length-1]}` : items.join(""); }
/* One reader per MCP server, named after its first tool: GitHub and GitHub Actions share the GitHub Reader. */
function readerGroups(entries){
  const groups=[];
  sortEntries((entries||[]).filter(e=>e.mcp)).forEach(e=>{
    const server=serverOf(e), group=groups.find(g=>g.server===server);
    if(group) group.entries.push(e); else groups.push({server, entries:[e]});
  });
  return groups.map(g=>({...g, name:`${entryInfo(g.entries[0]).short} Reader`}));
}

/* ---------------- Catalogue component ----------------
   The same markup in four places, prefixed nd (Explore), ag (Agent Builder), br (brief) and sc (approval).
   Each place keeps its selection here, so the files can be written without reading the page. */
const CAT_PLACES = {nd:()=>renderNeed(), ag:()=>renderAgent(), br:()=>renderBrief(), sc:()=>scopeToolsChanged()};
const catState = {};
function placeState(place){ return catState[place] || (catState[place]={tools:{}, other:{}}); }
function readCatalog(place){
  const state=placeState(place), entries=[];
  CATALOG.forEach(cat=>{
    cat.items.forEach(item=>{ if(state.tools[item.id]) entries.push(catalogEntry(item.id, state.tools[item.id].mcp)); });
    (state.other[cat.id]||[]).forEach(o=>{ const e=otherEntry(cat.id, o.name, o.mcp); if(e) entries.push(e); });
  });
  return entries;
}
function writeCatalog(place, entries){
  const state={tools:{}, other:{}};
  (entries||[]).forEach(e=>{
    if(ITEMS[e.id]) state.tools[e.id]={mcp:!!e.mcp && !CATS[ITEMS[e.id].cat].noMcp};
    else if(CATS[e.cat]) (state.other[e.cat] ||= []).push({name:e.name, mcp:!!e.mcp && !CATS[e.cat].noMcp});
  });
  catState[place]=state;
  paintCatalog(place);
}
function catalogHtml(place){
  const cat=c=>{
    const base=`${place}Cat-${c.id}`;
    const items=c.items.map(item=>{
      const id=`${place}-${item.id}`;
      return `<div class="cat-item" id="${id}-row"><label class="cat-tool"><input type="checkbox" id="${id}" value="${item.id}" onchange="toolTicked('${place}','${item.id}',this.checked)"/><span>${esc(item.name)}</span></label>`+
        (c.noMcp ? "" : `<label class="cat-mcp" id="${id}-mcpwrap" hidden><input type="checkbox" id="${id}-mcp" onchange="mcpTicked('${place}','${item.id}',this.checked)"/><span class="vh">${esc(item.name)} </span>via MCP</label>`)+
        `</div>`;
    }).join("");
    return `<details class="cat" id="${base}"><summary onclick="catTouched['${place}']=true"><span class="cat-name" id="${base}-name">${esc(c.name)}</span>`+
      `<span class="cat-count" id="${base}-count" aria-hidden="true"></span><span class="vh" id="${base}-sr"></span></summary>`+
      `<p class="muted cat-help">${esc(c.help)}</p>`+
      (items ? `<div class="cat-items" role="group" aria-labelledby="${base}-name">${items}</div>` : "")+
      `<div class="cat-other"><label for="${place}-${c.id}-other">${esc(c.other)}</label>`+
      `<input type="text" id="${place}-${c.id}-other" autocomplete="off" aria-describedby="${place}OtherHint ${place}-${c.id}-other-msg" onkeydown="otherKey(event,'${place}','${c.id}')" oninput="otherTyped('${place}','${c.id}',this.value)" onblur="commitOther('${place}','${c.id}')"/>`+
      `<p class="muted cat-other-msg" id="${place}-${c.id}-other-msg" role="status"></p>`+
      `<ul class="cat-custom" id="${place}-${c.id}-custom" aria-label="Your ${esc(c.other.replace(/^Other /,"").toLowerCase())}"></ul></div></details>`;
  };
  return `<div class="cat-find"><label for="${place}CatFind">Find a tool</label>`+
    `<input type="search" id="${place}CatFind" placeholder="e.g. Jira, Postgres, GitHub" autocomplete="off" oninput="filterCatalog('${place}')" onkeydown="findKey(event,'${place}')"/>`+
    `<p class="muted cat-status" id="${place}CatFindStatus" role="status"></p></div>`+
    CATALOG_GROUPS.map(group=>`<fieldset class="cat-group" id="${place}Grp-${group.id}"><legend>${esc(group.name)}</legend>`+
      CATALOG.filter(c=>c.group===group.id).map(cat).join("")+`</fieldset>`).join("")+
    `<div class="cat-group cat-else">${CATALOG.filter(c=>!c.group).map(cat).join("")}</div>`+
    `<p class="muted cat-hint" id="${place}OtherHint">In an "Other" field, separate names with commas.</p>`;
}
function buildCatalog(place){
  const root=document.getElementById(`${place}Systems`); if(!root) return;
  root.innerHTML=catalogHtml(place);
  placeState(place);
  paintCatalog(place);
}
/* Puts the state on the page: ticks, the MCP boxes of ticked tools, "Other" lists, badges and the summary line. */
function paintCatalog(place){
  const state=placeState(place);
  CATALOG.forEach(cat=>{
    cat.items.forEach(item=>{
      const id=`${place}-${item.id}`, on=!!state.tools[item.id];
      const box=document.getElementById(id); if(box) box.checked=on;
      const wrap=document.getElementById(`${id}-mcpwrap`); if(wrap) wrap.hidden=!on;
      const mcp=document.getElementById(`${id}-mcp`); if(mcp) mcp.checked=on && !!state.tools[item.id].mcp;
    });
    const others=state.other[cat.id]||[];
    const field=document.getElementById(`${place}-${cat.id}-other`);
    if(field && document.activeElement!==field) field.value=others.map(o=>o.name).join(", ");
    paintOthers(place, cat);
  });
  paintCounts(place);
}
function paintOthers(place, cat){
  const list=document.getElementById(`${place}-${cat.id}-custom`); if(!list) return;
  const others=placeState(place).other[cat.id]||[];
  list.hidden=!others.length;
  list.innerHTML=others.map((o,i)=>{
    const id=`${place}-other-${cat.id}-${slugify(o.name,"tool")}`;
    return `<li class="cat-item"><span class="cat-tool">${esc(o.name)}</span>`+
      (cat.noMcp ? "" : `<label class="cat-mcp"><input type="checkbox" id="${id}-mcp" ${o.mcp?"checked":""} onchange="otherMcp('${place}','${cat.id}',${i},this.checked)"/><span class="vh">${esc(o.name)} </span>via MCP</label>`)+
      `</li>`;
  }).join("");
}
function paintCounts(place){
  const entries=readCatalog(place);
  CATALOG.forEach(cat=>{
    const mine=entries.filter(e=>e.cat===cat.id), mcp=mine.filter(e=>e.mcp).length, base=`${place}Cat-${cat.id}`;
    const count=document.getElementById(`${base}-count`), sr=document.getElementById(`${base}-sr`);
    if(count){ count.textContent=mine.length ? (mcp ? `${mine.length} · ${mcp} MCP` : String(mine.length)) : ""; count.hidden=!mine.length; }
    if(sr) sr.textContent=mine.length ? `, ${mine.length} selected${mcp ? `, ${mcp} via MCP` : ""}` : "";
  });
  const summary=document.getElementById(`${place}CatSummary`);
  if(summary) summary.textContent=entries.length ? `Selected: ${entries.map(entryLabel).join(", ")}` : "Nothing selected yet.";
  paintServerIds(place);
}
function catChanged(place){
  paintCounts(place);
  CAT_PLACES[place]?.();
}
function toolTicked(place, id, on){
  const state=placeState(place);
  if(on) state.tools[id]=state.tools[id]||{mcp:false};
  else delete state.tools[id];
  paintCatalog(place);
  catChanged(place);
}
function mcpTicked(place, id, on){
  const tool=placeState(place).tools[id];
  if(tool) tool.mcp=!!on;
  catChanged(place);
}
function otherMcp(place, catId, index, on){
  const other=(placeState(place).other[catId]||[])[index];
  if(other) other.mcp=!!on;
  catChanged(place);
}
/* "Other" names are committed by a comma, Enter or leaving the field. Listed tools and repeats are ignored. */
function otherKey(event, place, catId){
  if(event.key!=="Enter" || event.isComposing) return;
  event.preventDefault();
  commitOther(place, catId);
}
function otherTyped(place, catId, value){ if(/,\s*$/.test(value)) commitOther(place, catId, true); }
function commitOther(place, catId, typing){
  const field=document.getElementById(`${place}-${catId}-other`); if(!field) return;
  const state=placeState(place), before=state.other[catId]||[], seen=new Set(), names=[], listed=[];
  String(field.value||"").split(",").map(cleanOtherName).filter(Boolean).forEach(name=>{
    const key=name.toLowerCase(), item=Object.values(ITEMS).find(i=>i.name.toLowerCase()===key);
    if(item){ listed.push(item.name); return; }
    if(seen.has(key) || names.length>=10) return;
    seen.add(key); names.push(name);
  });
  const next=names.map(name=>({name, mcp:!!before.find(o=>o.name.toLowerCase()===name.toLowerCase())?.mcp}));
  const msg=document.getElementById(`${place}-${catId}-other-msg`);
  if(msg) msg.textContent=listed.length ? `Already listed: ${andList(listed)} - tick ${listed.length>1?"them":"it"} above.` : "";
  const changed=JSON.stringify(next)!==JSON.stringify(before);
  if(next.length) state.other[catId]=next; else delete state.other[catId];
  field.value=next.map(o=>o.name).join(", ")+(typing && next.length ? ", " : "");
  paintOthers(place, CATS[catId]);
  if(changed) catChanged(place); else paintCounts(place);
}
/* The filter only hides and opens; it never changes a selection. Clearing it restores the open categories. */
const catOpenBefore = {}, catFindTimers = {};
function normalizeText(text){ return String(text||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").trim(); }
function filterCatalog(place){
  const field=document.getElementById(`${place}CatFind`); if(!field) return;
  const query=normalizeText(field.value);
  if(query && !catOpenBefore[place]) catOpenBefore[place]=CATALOG.filter(cat=>document.getElementById(`${place}Cat-${cat.id}`)?.open).map(cat=>cat.id);
  let matches=0;
  CATALOG.forEach(cat=>{
    const details=document.getElementById(`${place}Cat-${cat.id}`); if(!details || !cat.items.length) return;
    const catHit=!!query && normalizeText(cat.name).includes(query);
    let hits=0;
    cat.items.forEach(item=>{
      const hit=!query || catHit || [item.name,...(item.aliases||[])].some(text=>normalizeText(text).includes(query));
      const row=document.getElementById(`${place}-${item.id}-row`); if(row) row.hidden=!hit;
      if(hit && query) hits++;
    });
    matches+=hits;
    details.hidden=!!query && !hits && !catHit;
    if(query) details.open=hits>0 || catHit;
    else if(catOpenBefore[place]) details.open=catOpenBefore[place].includes(cat.id);
  });
  // "Something else" never hides, and opens when nothing matches, so the tool can be added there.
  CATALOG.filter(cat=>!cat.items.length).forEach(cat=>{
    const details=document.getElementById(`${place}Cat-${cat.id}`); if(!details) return;
    if(query) details.open=matches===0;
    else if(catOpenBefore[place]) details.open=catOpenBefore[place].includes(cat.id);
  });
  // A group whose categories are all filtered out hides its heading too.
  CATALOG_GROUPS.forEach(group=>{
    const box=document.getElementById(`${place}Grp-${group.id}`); if(!box) return;
    box.hidden=!!query && CATALOG.filter(cat=>cat.group===group.id).every(cat=>document.getElementById(`${place}Cat-${cat.id}`)?.hidden);
  });
  if(!query) delete catOpenBefore[place];
  clearTimeout(catFindTimers[place]);
  catFindTimers[place]=setTimeout(()=>{
    const status=document.getElementById(`${place}CatFindStatus`); if(!status) return;
    status.textContent=!query ? "" : matches ? `${matches} ${matches>1?"tools match":"tool matches"}.`
      : `No tool matches "${field.value.trim()}". Add it under Other in the closest category, or under Something else.`;
  }, 400);
}
function findKey(event, place){
  if(event.key==="Enter") event.preventDefault();
  if(event.key==="Escape" && event.target.value){ event.preventDefault(); event.target.value=""; filterCatalog(place); }
}
/* Role sets the group order (moved in the page, so focus order matches the screen), and Explore opens
   one starter category until the person opens or closes one themselves. */
const catTouched = {};
const STARTER_CAT = {developer:"scm", qa:"test", business:"tracker", manager:"tracker"};
function orderCatalogGroups(){
  const teamFirst=["business","manager"].includes(document.body.dataset.role);
  Object.keys(CAT_PLACES).forEach(place=>{
    const code=document.getElementById(`${place}Grp-code`), team=document.getElementById(`${place}Grp-team`);
    if(!code || !team || !code.parentNode) return;
    if(teamFirst && code.nextElementSibling===team) code.parentNode.insertBefore(team, code);
    if(!teamFirst && team.nextElementSibling===code) team.parentNode.insertBefore(code, team);
  });
  if(!catTouched.nd && !document.getElementById("ndCatFind")?.value){
    const starter=STARTER_CAT[document.getElementById("userRole")?.value]||"scm";
    CATALOG.forEach(cat=>{ const d=document.getElementById(`ndCat-${cat.id}`); if(d) d.open=cat.id===starter; });
  }
}
/* Entering question 6 focuses the first tool of the open category, not the filter, which would open a phone keyboard. */
function catalogFocusTarget(place){
  const open=CATALOG.find(cat=>document.getElementById(`${place}Cat-${cat.id}`)?.open && cat.items.length);
  return open ? document.getElementById(`${place}-${open.items[0].id}`) : document.getElementById(`${place}CatFind`);
}
/* The MCP server IDs panel lists every tool ticked via MCP in that place; an edit applies to the whole page. */
function paintServerIds(place){
  const list=document.getElementById(`${place}IdsList`); if(!list) return;
  const reach=readCatalog(place).filter(e=>e.mcp), panel=document.getElementById(`${place}Ids`);
  if(panel) panel.hidden=!reach.length;
  const html=reach.map(e=>{
    const id=`${place}-${slugify(e.id,"tool")}-sid`, value=serverIds[e.id] ?? serverOf(e), bad=!validServer(value);
    return `<div class="cat-sid"><label for="${id}">${esc(e.name)}<span class="vh"> MCP server ID</span></label>`+
      `<input type="text" id="${id}" value="${esc(value)}" autocomplete="off" aria-invalid="${bad}" aria-describedby="${id}-err" oninput="serverIdTyped('${esc(e.id)}',this.value,'${place}')"/>`+
      `<p class="field-error" id="${id}-err">${bad ? "Use letters, digits, hyphens and underscores." : ""}</p></div>`;
  }).join("");
  // Never rebuild the list under the cursor: typing in an ID field updates the page around it instead.
  if(list.dataset.html!==html && !list.contains?.(document.activeElement)){ list.innerHTML=html; list.dataset.html=html; }
}
function serverIdTyped(entryId, value, place){
  serverIds[entryId]=String(value||"").trim();
  const field=document.activeElement, bad=!validServer(serverIds[entryId]);
  if(field?.id?.endsWith("-sid")){
    field.setAttribute("aria-invalid", String(bad));
    const err=document.getElementById(field.id+"-err"); if(err) err.textContent=bad ? "Use letters, digits, hyphens and underscores." : "";
  }
  ["ag","sc"].forEach(p=>{ if(p!==place) paintServerIds(p); });
  renderNeed(); renderAgent(); scopeToolsChanged(); renderCreateFiles();
}
function invalidServerIds(entries){ return (entries||[]).filter(e=>e.mcp && e.id in serverIds && !validServer(serverIds[e.id])); }

/* ---------------- Files per assistant ----------------
   Copilot: .github/agents/*.agent.md and .github/skills; Claude Code: .claude/agents and .claude/skills;
   Codex: custom agents in .codex/agents/*.toml and skills in .agents/skills. Codex runs no custom agent
   as the main session, so its coordinator is a skill that spawns the readers. */
function piecePath(type, name, tool=currentTool()){
  const skill=type==="skill" || type==="prompt";
  if(tool==="claude") return skill ? `.claude/skills/${name}/SKILL.md` : `.claude/agents/${name}.md`;
  if(tool==="codex") return type==="sub" ? `.codex/agents/${name}.toml` : `.agents/skills/${name}/SKILL.md`;
  return skill ? `.github/skills/${name}/SKILL.md` : `.github/agents/${name}.agent.md`;
}
function promptCommand(name, tool=currentTool()){ return (tool==="codex" ? "$" : "/")+name; }
/* The name other files use to call an agent: Claude Code and Codex need identifiers, Copilot uses the display name. */
function agentId(name, tool){
  const text=String(name||"").trim();
  if(tool==="claude") return /^[a-z0-9][a-z0-9-]*$/.test(text) ? text : slugify(text,"agent");
  if(tool==="codex") return /^[a-z0-9][a-z0-9_]*$/.test(text) ? text : slugify(text,"agent").replace(/-/g,"_");
  return text;
}
/* Model levels per assistant, checked on 19 Nov 2026 against the Claude Code and Codex documentation.
   Copilot has no stable aliases, so it needs an exact model ID; until then its files inherit the model. */
const MODEL_TIERS = {
  claude:{inherit:"inherit", fast:"haiku", strong:"opus"},
  codex:{fast:"gpt-6-luna", strong:"gpt-6.2-sol"},
};
const TIER_LABEL = {inherit:"Inherit - the person's current model", fast:"Fast (low cost)", strong:"Strong"};
function modelFor(c, tool){
  const exact=String(c.model||"").trim();
  if(exact) return exact;
  return MODEL_TIERS[tool]?.[c.tier||"inherit"]||"";
}
const MCP_HOW = {
  copilot:"Their tools are granted in `tools:` as `<server>/*`; the server IDs must match your MCP configuration in VS Code or IntelliJ.",
  claude:"Their tools are granted in `tools:` as `mcp__<server>__*`; the server names must match your MCP configuration (`.mcp.json` or `claude mcp list`).",
  codex:"Codex reaches the MCP servers configured in `.codex/config.toml` or `~/.codex/config.toml`, under `[mcp_servers.<server>]`.",
};
const MCP_SETUP = {
  copilot:"in VS Code (`.vscode/mcp.json`) or in IntelliJ's MCP settings",
  claude:"in `.mcp.json` or with `claude mcp add`",
  codex:"in `.codex/config.toml` as `[mcp_servers.<id>]`",
};
function mcpServers(entries){ return [...new Set((entries||[]).filter(e=>e.mcp).map(serverOf))]; }
/* Context-only tools: the file names them, follows their conventions and asks for what it cannot reach. */
function stackSection(entries){
  const plain=sortEntries((entries||[]).filter(e=>!e.mcp));
  if(!plain.length) return [];
  const rows=[];
  plain.forEach(e=>{
    const cat=entryInfo(e).catName, row=rows.find(r=>r.cat===cat);
    if(row) row.names.push(e.name); else rows.push({cat, names:[e.name]});
  });
  const remote=plain.filter(e=>!entryInfo(e).local).map(e=>e.name);
  const L=["## Tools and stack","",...rows.map(r=>`- ${r.cat}: ${r.names.join(", ")}.`),""];
  if(plain.length>remote.length) L.push("Follow the conventions these tools already use in this repository.");
  if(remote.length) L.push(`You cannot reach ${andList(remote)} from here. Ask the user to paste what you need from ${remote.length>1?"them":"it"}, and never guess ${remote.length>1?"their":"its"} content.`);
  return L;
}
/* MCP tools: how to reach each one, where to start, which changes need approval and what to return.
   Subagent workers only read, so their changes are forbidden rather than approved. */
function systemsSection(entries, worker, tool){
  const reach=sortEntries((entries||[]).filter(e=>e.mcp));
  if(!reach.length) return [];
  const many=reach.length>1, servers=mcpServers(reach).length>1;
  const L=["## Systems","",
    `Reach ${many?"these tools":"this tool"} through ${servers?"their MCP servers":"its MCP server"}. ${MCP_HOW[tool]}`,"",
    "- Use only the tools of the servers below, and never guess a tool name.",
    worker ? "- Start from the identifiers in your task. If one you need is missing, say which instead of searching broadly."
      : "- Start from exact identifiers. If one you need is missing, ask for it instead of searching broadly.",
    worker ? "- Only read. Never call a tool that creates, changes, sends or deletes something."
      : "- Prefer read-only tools. Before any call that creates, changes, sends or deletes something, say what it will do and wait for explicit approval.",
    "- If a server is missing, sign-in fails or a call is refused, say so and stop. Never work around it."];
  reach.forEach(e=>{
    const s=entryInfo(e);
    L.push("",`### ${e.name}${s.what?` (${s.what})`:""} - MCP server \`${serverOf(e)}\``,"",
      `- Use it for: ${s.use||"what the task needs from it"}.`,
      `- Start from: ${s.start||"the exact identifiers or links of the case"}.`,
      `- ${worker?"Never":"Needs approval"}: ${s.change||"any change to its data or settings"}.`,
      `- Return: ${s.give||"the facts asked for, each with its source"}.`);
  });
  return L;
}
function agChecked(id){ return [...document.querySelectorAll(`#${id} input:checked`)].map(i=>i.value); }
/* ---------------- Need canvas (Step 0) ---------------- */
/* Real recurring annoyances per role, shown as examples only - clicking seeds the first
   field so the page isn't blank, but every other answer stays the user's own. */
const NEED_EXAMPLES = {
  engineer: [
    "working out why an acceptance test failed",
    "chasing which build a log line came from",
    "digging a value out of a huge log or export",
    "reviewing a pull request for risk",
    "checking whether the test data was even set up",
    "finding where a behaviour is actually implemented",
    "checking whether an environment is healthy",
  ],
  manager: [
    "working out whether we can ship on Thursday",
    "seeing what actually shipped in the last release",
    "finding which pull requests have been waiting too long",
    "checking a story is covered by tests before sign-off",
    "spotting which builds keep failing, and how often",
    "putting a status update together without chasing five people",
    "knowing an environment is healthy before a demo",
  ],
  business: [
    "explaining why a number on a statement looks wrong",
    "answering \"is this a defect, or expected?\" for a customer",
    "finding out whether a reported problem has happened before",
    "checking what was promised in a ticket versus what shipped",
    "chasing the status of something a customer is waiting on",
    "gathering the evidence to raise a proper bug report",
  ],
};
const NEED_PH = {
  engineer: {
    ndThink:"e.g. every time the nightly suite goes red I lose an hour. I open CI, find the build, scroll the console, hunt for the screenshot, then check whether the test data was even set up. Half the time it isn't a real bug at all…",
    ndPain:"e.g. working out why an acceptance test failed",
    ndWhen:"e.g. a nightly acceptance run goes red",
    ndWant:"e.g. see the build, the screenshot and the data together",
    ndDecision:"e.g. file a defect, fix the locator, or reset the data",
    ndTest:"e.g. last Tuesday's failure in the smoke suite",
  },
  manager: {
    ndThink:"e.g. every release week I lose a day chasing status. Who merged what, is the build green, has QA signed off - and I still end up guessing on the go/no-go call.",
    ndPain:"e.g. working out whether we can ship on Thursday",
    ndWhen:"e.g. the day before a release go/no-go call",
    ndWant:"e.g. see scope, what merged, build status and test results in one place",
    ndDecision:"e.g. go or no-go, and what to flag to stakeholders",
    ndTest:"e.g. last month's release, where I know what we should have flagged",
  },
  business: {
    ndThink:"e.g. a customer says a number on their statement looks wrong. I can't tell whether it's a real problem or expected behaviour, so I have to ask someone technical and wait.",
    ndPain:"e.g. explaining why a number on a statement looks wrong",
    ndWhen:"e.g. a customer questions something they've received",
    ndWant:"e.g. see what the system actually did for that account",
    ndDecision:"e.g. reply to the customer, or raise it as a defect",
    ndTest:"e.g. the query we resolved last month, where I know the answer",
  },
};
const NEED_WHYS = ["Why does that happen?","And why is that?","What's behind that?","Why hasn't that been solved already?","So what's the real blocker?"];
let needChain = [];

function needRole(){ return document.body.getAttribute("data-role") || "engineer"; }
function buildNeedUI(){
  buildCatalog("nd");
  applyRoleExamples();
}
/* Examples and placeholders are role-specific; the answers are not, so this never clears input. */
function applyRoleExamples(){
  const role=needRole();
  const e=document.getElementById("ndEgs");
  if(e) e.innerHTML = (NEED_EXAMPLES[role]||[]).map((x,i)=>
    `<button type="button" onclick="seedNeed(${i})">${esc(x)}</button>`).join("");
  const ph=NEED_PH[role]||{};
  Object.keys(ph).forEach(id=>{ const el=document.getElementById(id); if(el) el.placeholder=ph[id]; });
}
function seedNeed(i){
  const list=NEED_EXAMPLES[needRole()]||[];
  const p=document.getElementById("ndPain");
  p.value = list[i]||""; p.focus();
  renderNeed();
}

/* The page has no AI of its own - it hands the messy version to the assistant the reader already has. */
function copyThinkPrompt(btn){
  const raw=(document.getElementById("ndThink").value||"").trim();
  const systems=CATALOG.filter(cat=>cat.items.length).map(cat=>cat.name).join(", ");
  const prompt=
`I'm working out whether to build an AI agent for my team, and what it should do.

Here is the messy version, in my own words:
"""
${raw || "(I haven't written this yet - ask me for it first.)"}
"""

Turn that into these eight answers. Keep each to one short plain sentence. If something
genuinely isn't in my text, write "unclear" rather than inventing it.

1. Annoyance - what keeps costing me time
2. Trigger - when it happens
3. Capability - what I want to be able to do
4. Decision - what I will actually decide with the answer
5. Involves - pick all that apply: weigh evidence from several places / fetch one specific
   thing / the same fixed steps every time / the same request I keep retyping
6. Tools - which tools hold the answer or are used (categories: ${systems}), and which of
   them an AI assistant can already open itself through MCP
7. Frequency - several times a week / weekly / monthly / rarely
8. Test case - a past example where the correct answer is already known

Then tell me honestly whether this is worth building at all, or whether a short written
guide would serve better - and say which of these I should build: an agent (needs
judgement), a subagent (one narrow lookup), a skill (fixed steps), or a prompt (a shortcut).
If it needs several of them, list the pieces and the order to build them in.`;
  copyText(prompt, btn);
}

let needIndex=0, needReviewed=false;
function needCards(){ return [...document.querySelectorAll("#needQs .q")]; }
function showNeedQuestion(index){
  needIndex=Math.min(needCards().length,Math.max(0,index));
  document.getElementById("questionError").textContent="";
  document.querySelectorAll('#needQs [aria-invalid="true"]').forEach(input=>input.removeAttribute("aria-invalid"));
  paintNeed(true);
}
function moveNeed(direction,skip=false){
  const card=needCards()[needIndex];
  if(direction>0 && !skip && card && !card.classList.contains("done")){
    document.getElementById("questionError").textContent="Add an answer to continue, or choose Skip for now.";
    // Question 6 ties the error to the catalogue, not to its filter field.
    const tools=card.id==="q-systems", input=tools ? catalogFocusTarget("nd") : card.querySelector("input,select,textarea");
    if(tools) document.getElementById("ndSystems").setAttribute("aria-describedby","questionError");
    else input.setAttribute("aria-invalid","true");
    input.focus();
    return;
  }
  showNeedQuestion(needIndex+direction);
}
function paintNeed(focus=false){
  const cards=needCards(); if(!cards.length) return;
  const reviewing=needIndex===cards.length;
  if(reviewing) needReviewed=true;
  cards.forEach((card,i)=>{card.hidden=reviewing || i!==needIndex;});
  document.getElementById("questionWorkspace").hidden=reviewing;
  document.getElementById("needResult").hidden=!reviewing;
  const meta=document.getElementById("questionMeta");
  meta.hidden=reviewing;
  meta.textContent=needIndex===0 ? "Start with your own words" : `Question ${needIndex+1} of ${cards.length}`;
  const stage=reviewing ? "stageReview" : needIndex===0 ? "stageDescribe" : "stageClarify";
  ["stageDescribe","stageClarify","stageReview"].forEach(id=>{
    const item=document.getElementById(id);
    if(id===stage) item.setAttribute("aria-current","step");
    else item.removeAttribute("aria-current");
  });
  document.getElementById("needBack").disabled=needIndex===0;
  document.getElementById("needNext").textContent=needIndex===cards.length-1 ? "See my next step →" : "Continue →";
  document.getElementById("returnToSummary").hidden=!needReviewed;
  if(focus){
    if(reviewing) document.getElementById("resultHeading").focus();
    else (cards[needIndex].id==="q-systems" ? catalogFocusTarget("nd") : cards[needIndex].querySelector("input,select,textarea")).focus({preventScroll:true});
  }
}
document.addEventListener("keydown", e=>{
  if(e.key!=="Enter" || e.isComposing || e.target.tagName!=="INPUT" || e.target.type!=="text") return;
  if(!e.target.closest("#needQs") || e.target.closest(".chain,.help,.cat-find,.cat-other")) return;
  e.preventDefault(); moveNeed(1);
});
function digDeeper(){
  if(needChain.length >= NEED_WHYS.length) return;
  needChain.push("");
  renderChain(true);
}
function removeWhy(i){
  needChain.splice(i,1);
  renderChain(false);
}
function renderChain(focusLast){
  const wrap=document.getElementById("ndChain"); if(!wrap) return;
  const dig=document.getElementById("ndDig");
  wrap.hidden = needChain.length===0;
  wrap.innerHTML = needChain.length ? needChain.map((v,i)=>
    `<div class="wrow"><div class="cw">${esc(NEED_WHYS[i])}</div>
      <div class="wf"><input type="text" value="${esc(v)}" oninput="needChain[${i}]=this.value;renderNeed()" />
        <button type="button" class="wdel" title="Remove this step" aria-label="Remove this step" onclick="removeWhy(${i})">&times;</button>
      </div></div>`).join("")
    + `<div class="cw">The last answer you give is usually the need worth building for - copy it up into question 1 if it fits better.</div>` : "";
  if(dig){
    const capped = needChain.length >= NEED_WHYS.length;
    dig.disabled = capped;
    dig.textContent = capped ? "That's five whys - deep enough"
      : needChain.length ? "Ask why again" : "Dig deeper - ask \"why?\"";
  }
  if(focusLast) wrap.querySelector(".wrow:last-of-type input")?.focus();
  renderNeed();
}
/* Priority order: the first ticked part decides which builder opens next. */
const JUDGE_ORDER=["agent","sub","skill","prompt"];
function needState(){
  const v=id=>(document.getElementById(id)?.value||"").trim();
  const ticked=agChecked("ndJudge"), parts=JUDGE_ORDER.filter(part=>ticked.includes(part));
  return { pain:v("ndPain"), when:v("ndWhen"), want:v("ndWant"), decision:v("ndDecision"),
    judge:parts[0]||"", parts, freq:v("ndFreq"), test:v("ndTest"), systems:readCatalog("nd"),
    smallest:!!document.getElementById("ndSmallest")?.checked };
}
function needVerdict(n){
  const noDecision=!n.decision, rare=n.freq==="rare";
  const parts=n.parts||(n.judge?[n.judge]:[]), reach=(n.systems||[]).filter(e=>e.mcp);
  if(rare && n.freq) return { cls:"v-stop", label:"Don't build this",
    why:"It comes up only a few times a year. A one-page written guide answers it just as well and nobody has to maintain it." };
  if(noDecision && n.want) return { cls:"v-stop", label:"Not yet - find the decision",
    why:"Nothing is decided from the output, so this would be a report nobody reads. Answer question 4 first." };
  if(!parts.length) return { cls:"v-more", label:"Keep going", why:"Answer question 5 and I'll tell you what to build." };
  if(!n.systems.length) return { cls:"v-more", label:"No evidence source",
    why:"Pick at least one tool in question 6. If the answer only lives in someone's head, an agent can't reach it." };
  if(parts.includes("sub") && !reach.length) return { cls:"v-more", label:"No tool via MCP",
    why:"A reader needs a tool it can reach. Tick via MCP in question 6, or build an agent that asks you for the data." };
  const plan=needPlan(n);
  if(plan.length>1){
    const jobs={skill:"A skill holds the fixed steps.", sub:"One read-only reader per MCP server fetches the evidence.",
      agent:"The agent weighs the evidence and concludes.", prompt:"A shortcut sends the request you keep retyping."};
    return { cls:"v-split", label:`Build it as ${plan.length} small pieces`,
      why:"Start with piece 1, and add the rest once it works:",
      list:["skill","sub","agent","prompt"].filter(type=>plan.some(p=>p.type===type)).map(type=>jobs[type]) };
  }
  if(plan[0].type==="agent" && n.smallest && mcpServers(reach).length>1) return { cls:"v-agent", label:"Build an Agent",
    why:"It needs judgement across several sources. Start with one agent that opens the MCP tools directly; move the fetching into readers once it works." };
  const map={
    agent:{cls:"v-agent",label:"Build an Agent",
      why:"It needs judgement across several sources - exactly what an agent is for. Delegate the fetching to subagents and keep the conclusion."},
    sub:{cls:"v-sub",label:"Build a Subagent",
      why:"One narrow lookup that returns far less than it reads. Make it read-only and let your existing agents delegate to it."},
    skill:{cls:"v-skill",label:"Write a Skill",
      why:"Fixed steps in a fixed order. Capture it as a skill so every agent follows it identically, then invoke it from one."},
    prompt:{cls:"v-prompt",label:"Write a Prompt",
      why:"You're retyping a request, not needing judgement. A shortcut you run as a command takes minutes to write."},
  };
  return map[plan[0].type];
}

/* ---------------- Build plan: one request, several pieces ---------------- */
const PIECE_LABEL = {skill:"Skill", sub:"Subagent", agent:"Agent", prompt:"Prompt"};
const PIECE_CLASS = {skill:"v-skill", sub:"v-sub", agent:"v-agent", prompt:"v-prompt"};
const READER_RULES = ["Read only: never change, re-run or submit anything.",
  "Answer only the question you were given; leave conclusions to the agent that called you.",
  "Never output secrets, tokens or personal data."];
const COORDINATOR_RULES = ["Default to read-only investigation.",
  "Ask before any action that changes a ticket, a build, a record or a file.",
  "Never output secrets or personal data."];
function slugify(text, fallback){
  const slug=String(text||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-+/,"").slice(0,48).replace(/-+$/,"");
  return slug||fallback;
}
function needDescription(n){
  return `Use when ${n.when||"…"}. ${n.want?("Helps you "+n.want.replace(/^to /,"")+".") : ""} Supports the decision: ${n.decision||"…"}.`;
}
/* Copilot and Claude Code keep an on-demand skill out of automatic use with a frontmatter flag; Codex needs agents/openai.yaml. */
function skillMarkdown(name, desc, body, onDemand, tool=currentTool()){
  return ["---",`name: ${name}`,`description: ${JSON.stringify(desc)}`,
    ...(onDemand && tool!=="codex"?["disable-model-invocation: true"]:[]),"---","",...body,""].join("\n");
}
const CODEX_ON_DEMAND = "policy:\n  allow_implicit_invocation: false\n";
function withAgentNote(name, slug, tool){
  if(tool==="claude") return `Run it in a session started with \`claude --agent ${agentId(name,"claude")}\`.`;
  if(tool==="codex") return `Use it together with the \`$${slug}\` skill.`;
  return `Run it with the **${name}** agent selected.`;
}
/* Pieces come in build order: each one depends only on the pieces above it.
   Prompts become on-demand skills in every assistant. Readers exist only for MCP tools.
   Each piece has a stable id, so edits made in Create survive a renamed plan or another assistant. */
function needPlan(n, title){
  const tool=currentTool();
  const parts=n.parts||(n.judge?[n.judge]:[]), entries=n.systems||[], reach=entries.filter(e=>e.mcp);
  const name=(title||"").trim()||"My Assistant", slug=slugify(name,"my-assistant");
  const hasAgent=parts.includes("agent"), hasSkill=parts.includes("skill"), hasPrompt=parts.includes("prompt");
  const autoReaders=hasAgent && mcpServers(reach).length>1 && !n.smallest;
  const readers=parts.includes("sub") || autoReaders ? readerGroups(reach) : [];
  const total=readers.length+[hasAgent,hasSkill,hasPrompt].filter(Boolean).length;
  const want=n.want ? n.want.replace(/^to /,"") : "…", decision=n.decision||"…", when=n.when||"…";
  const steps=`${slug}-steps`, pieces=[];
  const userSections=()=>{
    const L=["",...ADAPT_SECTION];
    while(L[L.length-1]==="") L.pop();
    return L;
  };
  // With an agent in the plan, it or its readers reach the tools; otherwise the skill and prompt say how.
  const own=hasAgent ? [] : entries;
  const ownSection=[stackSection(own), systemsSection(own, false, tool)].filter(s=>s.length).flatMap(s=>["",...s]);
  if(hasSkill) pieces.push({id:"skill", type:"skill", name:steps, path:piecePath("skill",steps,tool), systems:own,
    job:"The fixed steps, written once and followed the same way every time.",
    content:skillMarkdown(steps, `Use when ${when}: the fixed steps to ${want}, always in the same order.`, [
      `# ${name} - steps`,"",
      "Follow these steps in order. If a step cannot be completed, stop and report which step and why.","",
      "1. Replace with the first step.","2. Replace with the next step.","3. Replace with the last step.","",
      "## Result","",
      `Report what each step found, with its source, so the user can decide: ${decision}.`,
      ...ownSection,
      ...userSections()], false, tool)});
  readers.forEach(group=>{
    const names=andList(group.entries.map(e=>e.name));
    const whats=[...new Set(group.entries.map(e=>entryInfo(e).what).filter(Boolean))].join("; ");
    const config={name:group.name, file:slugify(group.name,"reader"),
      desc:total===1 ? needDescription(n)
        : `Read-only lookup in ${names}${whats?` (${whats})`:""}. Use to answer one question and return a short summary with sources instead of raw output.`,
      hint:"The exact question, identifiers and time window", worker:true, systems:group.entries, rules:READER_RULES, tier:"inherit"};
    pieces.push({id:`sub:${group.entries[0].id}`, type:"sub", name:config.name, path:piecePath("sub",config.file,tool),
      job:`Looks up facts in ${names} and returns a short summary.${hasAgent?" Only the agent calls it.":""}`,
      config, content:agentFile(config, tool)});
  });
  if(hasAgent){
    const subs=pieces.filter(p=>p.type==="sub").map(p=>p.name);
    // Readers cover every MCP tool; the agent keeps the context-only ones, or everything when it has no readers.
    const config={name, file:slug, desc:needDescription(n), hint:"Identifiers, links and the time window of the case",
      systems:subs.length ? entries.filter(e=>!e.mcp) : entries, subs, skill:hasSkill?steps:"", adapt:true,
      rules:COORDINATOR_RULES, tier:"inherit"};
    const extra=[subs.length?"calls the readers":"", hasSkill?"follows the steps":""].filter(Boolean);
    pieces.push({id:"agent", type:"agent", name, path:piecePath("agent",slug,tool),
      job:`Weighs the evidence and concludes${extra.length?"; it "+extra.join(" and "):""}.`,
      config, content:agentFile(config, tool)});
  }
  if(hasPrompt){
    // In Codex the agent is a skill too, so the prompt takes another name to keep its own folder.
    const promptName=tool==="codex" && hasAgent ? `${slug}-prompt` : slug;
    const command=promptCommand(promptName, tool);
    const prompt={id:"prompt", type:"prompt", name:promptName, path:piecePath("prompt",promptName,tool), systems:own,
      job:`The request you keep retyping, as the ${command} command.${hasAgent?" "+withAgentNote(name, slug, tool).replace(/\*\*/g,""):""}`,
      content:skillMarkdown(promptName, `The request to send when ${when}. Run it as ${command} followed by the details of the case.`, [
        `# ${name}`,"",
        `When ${when}, help me ${want}. Use the details I give after the command: identifiers, links and the time window.`,
        ...(hasAgent?["",withAgentNote(name, slug, tool)]:[]),"",
        `Show what you found separately from what you concluded, so I can decide: ${decision}.`,
        "If a detail is missing, ask for it instead of guessing.",
        ...ownSection,
        ...userSections()], true, tool)};
    if(tool==="codex") prompt.extra=[{path:`.agents/skills/${promptName}/agents/openai.yaml`, content:CODEX_ON_DEMAND}];
    pieces.push(prompt);
  }
  return pieces;
}
/* Changes made in Create are kept per piece, so Explore and Create always download the same files. */
let pieceEdits={};
function pieceFromConfig(piece, config){
  const tool=currentTool(), c={...config}, type=c.worker ? "sub" : "agent";
  return {...piece, type, name:c.name, path:piecePath(type, c.file, tool), config:c, content:agentFile(c, tool)};
}
function currentPlan(n, title){
  const pieces=needPlan(n, title).map(p=>p.config && pieceEdits[p.id] ? pieceFromConfig(p, pieceEdits[p.id]) : p);
  const agent=pieces.find(p=>p.id==="agent");
  if(agent && !pieceEdits.agent){
    // A renamed reader must still be the one the agent calls.
    const readers=pieces.filter(p=>p.id.startsWith("sub:")).map(p=>p.name);
    if(readers.join("\n")!==agent.config.subs.join("\n")) pieces[pieces.indexOf(agent)]=pieceFromConfig(agent, {...agent.config, subs:readers});
  }
  return pieces;
}
/* Every file of a plan: a Codex prompt also needs its agents/openai.yaml. */
function planFiles(plan){ return plan.flatMap(p=>[{path:p.path, content:p.content}, ...(p.extra||[])]); }
function uniqueEntries(entries){ const seen=new Set(); return entries.filter(e=>!seen.has(e.id) && seen.add(e.id)); }
function fenceFor(path){ return path.endsWith(".toml") ? "toml" : path.endsWith(".yaml") ? "yaml" : "markdown"; }
const TOOL_PLAN_NOTE = {
  copilot:"The same files work in VS Code and in IntelliJ with the GitHub Copilot plugin.",
  claude:"Claude Code loads them from `.claude/agents` and `.claude/skills`. Start an agent with `claude --agent <name>`.",
  codex:"Codex loads custom agents from `.codex/agents` and skills from `.agents/skills`. An agent is a skill here: run it as `$<name>`.",
};
const TOOL_PROMPT_NOTE = {
  copilot:["The prompt is written as a skill that runs only when you type its command, because",
    "VS Code is phasing out `.prompt.md` files in favour of skills."],
  claude:["The prompt is a skill that runs only when you type its command (`disable-model-invocation: true`)."],
  codex:["The prompt is a skill that runs only when you type its command: its `agents/openai.yaml`",
    "turns off implicit invocation."],
};
function planMarkdown(n, plan, title){
  const tool=currentTool(), name=(title||"").trim()||"My Assistant";
  const cell=s=>String(s).replace(/\|/g,"\\|").replace(/\s+/g," ");
  const shown=p=>p.type==="prompt" ? `\`${promptCommand(p.name, tool)}\`` : p.type==="skill" ? `\`${p.name}\`` : cell(p.name);
  const saveAs=p=>[p.path,...(p.extra||[]).map(f=>f.path)].map(path=>`\`${path}\``).join(" and ");
  const reach=sortEntries(uniqueEntries(plan.flatMap(p=>p.config?.systems||p.systems||[]))).filter(e=>e.mcp);
  const L=[`# Build plan - ${name}`,"",
    ...(plan.length>1 ? ["Your request covers more than one job, so it is split into pieces. Build and test them in this",
      "order: each piece depends only on the pieces above it."] : ["This piece needs more than one file. Save each one where the table shows."]),"",
    "| # | Piece | Name | Save as | Its job |","|---|---|---|---|---|",
    ...plan.map((p,i)=>`| ${i+1} | ${PIECE_LABEL[p.type]} | ${shown(p)} | ${saveAs(p)} | ${cell(p.job)} |`),"",
    `These files are for ${TOOLS[tool].label}. ${TOOL_PLAN_NOTE[tool]}`];
  if(plan.some(p=>p.type==="prompt")) L.push(...TOOL_PROMPT_NOTE[tool]);
  if(reach.length){
    const servers=mcpServers(reach);
    L.push("",`These files reach ${andList(reach.map(e=>e.name))} through MCP. Configure ${servers.length>1?"these servers":"this server"} ${MCP_SETUP[tool]}`,
      `with ${servers.length>1?"these IDs":"this ID"}: ${servers.map(s=>`\`${s}\``).join(", ")}, or change the IDs in the files to match yours.`);
  }
  const tests=[...(plan.some(p=>p.type==="sub")?["Ask each reader one question whose answer you already know."]:[]),
    `Run the whole flow on a past case where you know the right answer: ${n.test||"choose one before you start"}.`,
    "Check that the answer separates what was observed from what was concluded, and says \"I don't know\" instead of guessing."];
  L.push("","## How to test it","",...tests.map((t,i)=>`${i+1}. ${t}`),"","## Starter files","");
  planFiles(plan).forEach((f,i)=>L.push(`### ${i+1}. \`${f.path}\``,"","````"+fenceFor(f.path),f.content.trimEnd(),"````",""));
  return L.join("\n");
}
function planTitle(){ return (document.getElementById("planName")?.value||"").trim(); }
let planDownload="build-plan.md", lastPlan=[], lastPlanMarkdown="";
function planFilename(){ return planDownload; }
function copyPiece(index, button){ if(lastPlan[index]) copyText(lastPlan[index].content, button); }
/* One command per shell writes every starter file. Existing files are skipped, never overwritten. */
const SH_END="AGENT_LAB_EOF";
function planScripts(plan){
  const files=planFiles(plan);
  const unsafe=files.some(f=>f.content.split("\n").some(line=>line.startsWith("'@") || line===SH_END));
  if(unsafe) return null;
  const ps=["$utf8 = New-Object System.Text.UTF8Encoding($false)"];
  const sh=['write_file() { if [ -e "$1" ]; then echo "Skipped existing $1"; else mkdir -p "$(dirname "$1")" && cat > "$1"; fi; }'];
  files.forEach(f=>{
    const win=f.path.split("/").join("\\"), dir=win.slice(0,win.lastIndexOf("\\"));
    ps.push("",`if (Test-Path '${win}') { Write-Warning 'Skipped existing ${win}' } else {`,
      `  New-Item -ItemType Directory -Force '${dir}' | Out-Null`,
      `  [IO.File]::WriteAllText((Join-Path $PWD '${win}'), @'`, f.content.trimEnd(), "'@, $utf8)", "}");
    sh.push("",`write_file '${f.path}' <<'${SH_END}'`, f.content.trimEnd(), SH_END);
  });
  return { ps:ps.join("\n"), sh:sh.join("\n") };
}
/* Juniors start with the smallest version unless they changed the option themselves. */
let smallestTouched=false;
function syncSmallestDefault(){
  const box=document.getElementById("ndSmallest");
  if(box && !smallestTouched) box.checked=document.getElementById("suBand")?.value==="lt2";
}
function smallestChanged(){ smallestTouched=true; renderNeed(); }
function renderNeed(){
  const bar=document.getElementById("ndBar"); if(!bar) return;
  const n=needState(), tool=currentTool();
  const JUDGE={agent:"Weigh evidence, then conclude",sub:"Fetch one specific thing",
    skill:"The same fixed steps",prompt:"The same request, retyped"};
  const FREQ={high:"Several times a week",weekly:"Weekly",monthly:"Monthly",rare:"Rarely"};
  const reach=n.systems.filter(e=>e.mcp);
  const checks=[
    ["Annoyance", n.pain, n.pain],
    ["Trigger", n.when, n.when],
    ["Capability", n.want, n.want],
    ["Decision", n.decision, n.decision],
    ["Involves", n.parts.length>0, n.parts.map(part=>JUDGE[part]).join(", ")],
    ["Evidence", n.systems.length>0, n.systems.map(entryLabel).join(", ")],
    ["Frequency", n.freq, FREQ[n.freq]],
    ["Test case", n.test, n.test],
  ];
  const done=checks.filter(c=>c[1]).length, pct=Math.round(done/checks.length*100);
  bar.style.width=pct+"%";
  document.getElementById("ndPct").textContent=`${done} of ${checks.length} answered`;
  document.getElementById("ndMiss").innerHTML=checks.map(([lab,ok,val],index)=>{
    const shown = ok ? esc(String(val)) : "not answered yet";
    return `<li class="tr ${ok?"ok":""}"><button type="button" class="answer-edit" onclick="showNeedQuestion(${index})"><span class="tk">${esc(lab)} <span class="edit-hint">Edit</span></span><span class="tv">${shown}</span></button></li>`;
  }).join("");
  [["q-pain",n.pain],["q-when",n.when],["q-want",n.want],["q-decision",n.decision],
   ["q-judge",n.parts.length>0],["q-systems",n.systems.length>0],["q-freq",n.freq],["q-test",n.test]]
    .forEach(([id,ok])=>document.getElementById(id)?.classList.toggle("done",!!ok));
  const current=needCards()[needIndex];
  if(current?.classList.contains("done")){
    document.getElementById("questionError").textContent="";
    current.querySelectorAll('[aria-invalid="true"]').forEach(input=>input.removeAttribute("aria-invalid"));
  }

  const v=needVerdict(n), role=document.body.getAttribute("data-role")||"engineer", doc=DOC_FOR_PERSPECTIVE[role]||"agent";
  // Only offer to carry over once we've actually concluded something worth building.
  const buildable=["v-agent","v-sub","v-prompt","v-skill","v-split"].includes(v.cls);
  const ready = buildable && n.pain && n.when && n.want && n.decision;
  const plan=buildable ? currentPlan(n, planTitle()) : [];
  const showPlan=plan.length>1 || ["skill","prompt"].includes(plan[0]?.type);
  const first=mainPiece(plan);
  let note="";
  if(!buildable) note = v.cls==="v-stop" ? "Nothing to carry over yet - resolve the point above first."
                                         : "Finish the questions and I'll offer to carry this over.";
  else if(!ready) note = "Answer questions 1-4 to carry this over.";
  else if(doc==="brief") note = "Create opens a brief for the builder, filled from your answers."+(plan.length>1?" It can include the build plan.":"");
  else if(doc==="approval") note = "Create opens an approval record, filled from your answers.";
  else if(plan.length>1) note = `Create opens all ${plan.length} files, starting with ${esc(first.name)}. Change any of them there.`;
  else if(showPlan) note = "Create opens this starter file. You can also save it from here.";
  else note = "Create opens the agent file, filled from your answers.";
  document.getElementById("ndVerdict").innerHTML = `<span class="vbadge ${v.cls}">${v.label}</span><p>${v.why}</p>` +
    (v.list ? `<ul class="verdict-list">${v.list.map(item=>`<li>${item}</li>`).join("")}</ul>` : "");
  const smallestRow=document.getElementById("ndSmallestRow");
  if(smallestRow) smallestRow.hidden=!(buildable && n.parts.includes("agent") && !n.parts.includes("sub") && mcpServers(reach).length>1);
  const offer=document.getElementById("ndMentor");
  if(offer) offer.hidden=!buildable;
  const many=planFiles(plan).length>1;
  lastPlan=showPlan ? plan : [];
  lastPlanMarkdown=showPlan && many ? planMarkdown(n, plan, planTitle()) : "";
  const box=document.getElementById("ndPlanBox");
  if(box){
    box.hidden=!showPlan;
    if(showPlan){
      document.getElementById("plTitle").textContent=many ? "Build plan" : "Starter file";
      document.getElementById("plHint").textContent=many ? "every piece, with a starter file" : `save it as ${plan[0].path}`;
      document.getElementById("ndPlan").innerHTML=plan.map((p,i)=>
        `<li><span class="vbadge ${PIECE_CLASS[p.type]}">${PIECE_LABEL[p.type]}</span><span class="pbody"><span class="pname">${esc(p.type==="prompt" ? promptCommand(p.name, tool) : p.name)}${i===0 && plan.length>1 ? ' <span class="start-here">Start here</span>' : ""}</span><code>${esc(p.path)}</code>${(p.extra||[]).map(f=>`<code>${esc(f.path)}</code>`).join("")}<span class="pjob">${esc(p.job)}</span></span><button type="button" class="piece-copy" aria-label="Copy ${esc(p.path)}" onclick="copyPiece(${i},this)">Copy</button></li>`).join("");
      document.getElementById("plOut").textContent=many ? lastPlanMarkdown : plan[0].content;
      planDownload=many ? "build-plan.md" : fileName(plan[0].path);
      renderScripts("pl", plan);
    }
  }
  document.getElementById("ndNext").innerHTML =
    `<button class="applybtn" onclick="applyNeed()" ${ready?"":"disabled"}>Continue to Create</button>` +
    (note?`<p class="muted" style="margin:8px 0 0;font-size:12px">${note}</p>`:"");
}
/* "Create all files with one command", shared by the build plan in Explore and the file list in Create. */
function renderScripts(prefix, plan){
  const details=document.getElementById(prefix+"Scripts"); if(!details) return;
  const scripts=planScripts(plan), count=planFiles(plan).length;
  details.hidden=!scripts;
  if(!scripts) return;
  document.getElementById(prefix+"ScriptsTitle").textContent=count>1 ? `Create all ${count} files with one command` : "Create the file with one command";
  document.getElementById(prefix+"Ps").textContent=scripts.ps;
  document.getElementById(prefix+"Sh").textContent=scripts.sh;
}
/* The piece that needs the most judgement opens first; the others are one click away. */
function mainPiece(plan){ return plan.find(p=>p.id==="agent")||plan.find(p=>p.type==="sub")||plan[0]||null; }
/* Continue opens Create on the document this role usually makes. It never changes the role. */
function applyNeed(){
  chooseDocument(DOC_FOR_PERSPECTIVE[needRole()]||"agent");
  go("build");
  document.getElementById(MAKE_IDS[document.body.dataset.doc])?.focus({preventScroll:true});
}

/* ---------------- Create: finish what Explore recommended ----------------
   Create keeps a snapshot of the Explore answers it was filled from. It refreshes itself while
   nothing was edited here, and otherwise offers an update instead of overwriting edits. */
let createFrom=null, createEdited=false, crPiece="";
function exploreSnapshot(){
  const n=needState();
  const ready=["v-agent","v-sub","v-prompt","v-skill","v-split"].includes(needVerdict(n).cls) && n.pain && n.when && n.want && n.decision;
  return ready ? {n, title:planTitle()} : null;
}
function sameSnapshot(a, b){ return !!a && !!b && JSON.stringify(a)===JSON.stringify(b); }
function syncCreate(force){
  const now=exploreSnapshot();
  if(now && (force===true || (!createEdited && !sameSnapshot(now, createFrom)))) fillCreate(now);
  renderCreateSource(now);
  renderCreateFiles();
}
function fillCreate(snapshot){
  createFrom=snapshot; createEdited=false; pieceEdits={};
  const plan=currentPlan(snapshot.n, snapshot.title);
  fillBrief(snapshot.n, snapshot.title, plan);
  fillScope(snapshot.n, snapshot.title, plan);
  crPiece=mainPiece(plan)?.id||"";
  loadPiece();
  renderNeed();
}
function renderCreateSource(now){
  const strip=document.getElementById("createSource"); if(!strip) return;
  const differs=!!now && !sameSnapshot(now, createFrom);
  let state="synced", html=now ? "Filled from your Explore answers. Your changes here are kept."
                                : "Filled from your earlier Explore answers. Your changes here are kept.";
  if(!createFrom && !now){
    state="example";
    html='These are example values. Answer the questions in Explore and this page fills in from your own need. <button type="button" onclick="go(\'custom\')">Start in Explore</button>';
  } else if(differs){
    state="stale";
    html=(createFrom ? "Your Explore answers changed after you edited this page." : "Your Explore answers are ready.")+
      ' <button type="button" onclick="syncCreate(true)">'+(createFrom ? "Update from Explore" : "Fill from Explore")+'</button> <span class="muted">Replaces your edits on this page.</span>';
  }
  strip.dataset.state=state;
  strip.innerHTML=html;
}
function createPieces(){ return createFrom ? currentPlan(createFrom.n, createFrom.title) : []; }
function selectedPiece(){ return createPieces().find(p=>p.id===crPiece)||null; }
function selectPiece(id){ crPiece=id; loadPiece(); renderCreateFiles(); }
function setChecks(wrap, values){ document.querySelectorAll(`#${wrap} input`).forEach(i=>{ i.checked=values.includes(i.value); }); }
/* Agents and subagents open in the Agent Builder; skills and prompts are shown as their starter file. */
function loadPiece(){
  const c=selectedPiece()?.config;
  if(!c) return renderAgent();
  const set=(id,v)=>{ const el=document.getElementById(id); if(el) el.value=v; };
  const subs=c.subs||[];
  set("agName",c.name); set("agFile",c.file); set("agDesc",c.desc); set("agHint",c.hint||"");
  set("agTier",c.tier||"inherit"); set("agModel",c.model||"");
  set("agKind",c.worker ? "worker" : "agent");
  writeCatalog("ag", c.systems||[]);
  const options=delegateOptions(subs);
  renderDelegates(subs.filter(s=>options.includes(s)));
  set("agCustomSubs",subs.filter(s=>!options.includes(s)).join("\n"));
  const adapt=document.getElementById("agAdapt"); if(adapt) adapt.checked=!!c.adapt;
  set("agRules",(c.rules||[]).join("\n"));
  renderAgent();
}
/* An edit in the Agent Builder becomes that piece's version in the plan, once its names are valid. */
function builderEdited(){
  createEdited=true;
  const piece=selectedPiece();
  if(piece?.config){
    const c=builderConfig();
    if(validServer(c.file) && !invalidServerIds(c.systems).length) pieceEdits[piece.id]=c;
  }
  renderCreateSource(exploreSnapshot());
  renderCreateFiles();
  renderNeed();
}
function createInput(event){
  const target=event.target;
  // Choosing a document or filtering a catalogue changes nothing in the result.
  if(target.name==="makeDoc" || target.closest?.(".cat-find")) return;
  if(target.closest?.("#agBuilder")) return builderEdited();
  createEdited=true;
  renderCreateSource(exploreSnapshot());
}
function renderCreateFiles(){
  const box=document.getElementById("crPiecesBox"); if(!box) return;
  const plan=createPieces(), piece=plan.find(p=>p.id===crPiece)||null, many=plan.length>1;
  box.hidden=!many;
  document.getElementById("crAllBox").hidden=!many;
  if(many){
    document.getElementById("crPieces").innerHTML=plan.map(p=>
      `<li><button type="button" class="piece-pick" aria-pressed="${p.id===crPiece}" onclick="selectPiece('${esc(p.id)}')"><span class="vbadge ${PIECE_CLASS[p.type]}">${PIECE_LABEL[p.type]}</span><span class="pbody"><span class="pname">${esc(p.type==="prompt" ? promptCommand(p.name) : p.name)}${pieceEdits[p.id] ? ' <span class="edited">Edited</span>' : ""}</span><code>${esc(p.path)}</code>${(p.extra||[]).map(f=>`<code>${esc(f.path)}</code>`).join("")}</span></button></li>`).join("");
    renderScripts("cr", plan);
  }
  const editable=!piece || !!piece.config;
  document.getElementById("agBuilder").hidden=!editable;
  const starter=document.getElementById("crStarter");
  starter.hidden=editable;
  if(!editable){
    document.getElementById("crStarterTitle").textContent=piece.type==="prompt" ? `Prompt ${promptCommand(piece.name)}` : `Skill ${piece.name}`;
    document.getElementById("crStarterPath").textContent=piece.path;
    document.getElementById("crStarterNote").textContent=piece.type==="prompt"
      ? "Save it in the folder shown, then adjust the request in your editor if you need to. This page does not edit prompts."
      : "Save it in the folder shown, then replace the example steps in your editor. This page does not edit skills.";
    document.getElementById("crStarterOut").textContent=piece.content;
    const extra=(piece.extra||[])[0], extraBox=document.getElementById("crStarterExtra");
    if(extraBox){
      extraBox.hidden=!extra;
      if(extra){
        document.getElementById("crStarterExtraPath").textContent=extra.path;
        document.getElementById("crStarterExtraOut").textContent=extra.content;
      }
    }
  }
  const briefPlan=document.getElementById("brPlanRow");
  if(briefPlan) briefPlan.hidden=!many;
  if(document.getElementById("brIncludePlan")?.checked) renderBrief();
}
function mimeFor(path){ return path.endsWith(".toml") ? "application/toml" : path.endsWith(".yaml") ? "application/yaml" : "text/markdown"; }
function downloadStarter(){ const piece=selectedPiece(); if(piece) downloadText(fileName(piece.path), piece.content, mimeFor(piece.path)); }
function copyStarter(button){ const piece=selectedPiece(); if(piece) copyText(piece.content, button); }
function downloadStarterExtra(){ const extra=selectedPiece()?.extra?.[0]; if(extra) downloadText(fileName(extra.path), extra.content, mimeFor(extra.path)); }
function copyStarterExtra(button){ const extra=selectedPiece()?.extra?.[0]; if(extra) copyText(extra.content, button); }
function downloadCreatePlan(){
  const plan=createPieces();
  if(plan.length>1) downloadText("build-plan.md", planMarkdown(createFrom.n, plan, createFrom.title), "text/markdown");
}
const FREQ_TEXT={high:"Several times a week",weekly:"Weekly",monthly:"Monthly",rare:"Rarely - a few times a year"};
/* Fields Explore does not ask about get neutral text, never the example's. */
function fillBrief(n, title, plan){
  const set=(id,v)=>{ const el=document.getElementById(id); if(el) el.value=v; };
  set("brTitle",title); set("brWhen",n.when); set("brWant",n.want); set("brSo",n.decision);
  set("brDecision",n.decision); set("brTest",n.test||""); set("brReader","");
  set("brNever","Change anything without asking first\nShow secrets or personal data"); set("brOutput","");
  if(FREQ_TEXT[n.freq]) set("brFreq",FREQ_TEXT[n.freq]);
  writeCatalog("br", n.systems);
  const include=document.getElementById("brIncludePlan"); if(include) include.checked=plan.length>1;
  renderBrief();
}
const SCOPE_GATES=["Repeated - happens weekly or more, by more than one person",
  "Evidence-bound - the answer lives in tools, not in someone's head",
  "Decision-linked - someone acts on the output",
  "Checkable - a past case exists to test against"];
function fillScope(n, title, plan){
  const set=(id,v)=>{ const el=document.getElementById(id); if(el) el.value=v; };
  const met=[["high","weekly"].includes(n.freq), n.systems.length>0, !!n.decision, !!n.test];
  set("scName",title);
  setChecks("scGates",SCOPE_GATES.filter((gate,i)=>met[i]));
  writeCatalog("sc", n.systems);
  buildScopeSubs(plan.filter(p=>p.type==="sub").map(p=>p.name));
  set("scWrite","none"); set("scModel","inherit"); set("scDecision","Pilot");
  set("scNotes","Read-only for the pilot.\nRevisit write access only after the pilot shows it is useful.");
  renderScope();
}
/* The approval record offers the readers of the tools it grants via MCP, plus any already chosen. */
function buildScopeSubs(checkedNames){
  const u=document.getElementById("scSubs"); if(!u) return;
  const options=[...new Set([...readerGroups(readCatalog("sc")).map(g=>g.name),...checkedNames])];
  u.innerHTML=options.length ? options.map(name=>
    `<label><input type="checkbox" value="${esc(name)}" ${checkedNames.includes(name)?"checked":""} onchange="renderScope()"/>${esc(name)}</label>`).join("")
    : '<p class="muted">Readers appear for tools granted via MCP.</p>';
}
function scopeToolsChanged(){ buildScopeSubs(agChecked("scSubs")); renderScope(); }
const BRIEF_EXAMPLE = ["jira","oracle"];
function buildBriefChecks(){
  buildCatalog("br"); writeCatalog("br", BRIEF_EXAMPLE.map(id=>catalogEntry(id,false)));
  buildCatalog("sc");
  buildScopeSubs([]);
  [["brCopyBtn",ICON_COPY],["brDlBtn",ICON_DL],["scCopyBtn",ICON_COPY],["scDlBtn",ICON_DL]]
    .forEach(([id,ic])=>{ const el=document.getElementById(id); if(el) el.innerHTML=ic; });
}
function countText(n, one, many){ return `${n} ${n===1?one:many}`; }
function renderBrief(){
  const out=document.getElementById("brOut"); if(!out) return;
  const v=id=>(document.getElementById(id).value||"").trim();
  const bullets=t=>t.split("\n").map(x=>x.trim()).filter(Boolean).map(x=>`- ${x}`);
  const tools=readCatalog("br");
  const count=document.getElementById("brAdvCount");
  if(count) count.textContent=tools.length ? ` · ${countText(tools.length,"tool","tools")}` : "";
  const freq=v("brFreq"), rare=freq.startsWith("Rarely");
  const L=[`# Agent brief - ${v("brTitle")||"(untitled)"}`,""];
  if(v("brWho")) L.push(`**Requested by:** ${v("brWho")}`,"");
  L.push("## The job","",
    `When **${v("brWhen")||"…"}**,`,
    `I want to **${v("brWant")||"…"}**,`,
    `so I can **${v("brSo")||"…"}**.`,"",
    "## Why it's worth building","",
    `- **Decision it supports:** ${v("brDecision")||"_not yet answered - this must be filled in_"}`,
    `- **How often:** ${freq}`,
    `- **Who reads the output:** ${v("brReader")||"_not stated_"}`,"");
  L.push("## Where the answer lives today","",
    ...(tools.length ? tools.map(e=>`- ${e.name} (${entryInfo(e).catShort}) - ${e.mcp
      ? "the AI can reach it via MCP" : "context only: check for an MCP server, or plan to paste the data"}`) : ["- _not stated_"]),"");
  const never=bullets(v("brNever"));
  L.push("## It must never","", ...(never.length?never:["- _not stated_"]),"",
    "It should stay **read-only**: it may look at anything I'm allowed to see, but it must come back",
    "and ask before changing a ticket, a build, or a record.","",
    "## What good output looks like","", v("brOutput")||"_not stated_","",
    "## How to test it","",
    v("brTest") ? `Run it against: ${v("brTest")} - I already know the correct answer for this case.`
               : "_I still need to supply a past case where the correct answer is already known._","",
    "## What I'll check on the first version","",
    "- Did it reach the same conclusion as the known case?",
    "- Did it show where each fact came from, rather than just asserting?",
    "- Was anything confidently wrong? (It should say \"I don't know\" instead of guessing.)");
  if(rare) L.push("","> **Note:** this comes up rarely - a written guide may be a better answer than an agent.");
  if(!v("brDecision")) L.push("","> **Warning:** no decision is attached to this output yet. Answer that before building.");
  const plan=createPieces();
  if(document.getElementById("brIncludePlan")?.checked && plan.length>1) L.push("","---","",planMarkdown(createFrom.n, plan, createFrom.title));
  out.textContent=L.join("\n");
}
/* What a model level means for the chosen assistant, in the record and next to the builder's Model field. */
function tierText(tier, tool){
  if(!tier || tier==="inherit") return TIER_LABEL.inherit;
  const model=MODEL_TIERS[tool]?.[tier];
  return model ? `${TIER_LABEL[tier]} - ${model} in ${TOOLS[tool].label}` : `${TIER_LABEL[tier]} - set an exact model ID in ${TOOLS[tool].label}`;
}
function renderScope(){
  const out=document.getElementById("scOut"); if(!out) return;
  const v=id=>(document.getElementById(id).value||"").trim();
  const tool=currentTool(), tools=readCatalog("sc"), reach=tools.filter(e=>e.mcp), plain=tools.filter(e=>!e.mcp);
  const gates=agChecked("scGates"), subs=agChecked("scSubs");
  const count=document.getElementById("scAdvCount");
  if(count) count.textContent=reach.length ? ` · ${countText(mcpServers(reach).length,"MCP grant","MCP grants")}` : "";
  const allGates=gates.length===4, write=v("scWrite"), model=v("scModel"), decision=v("scDecision");
  const WRITE_TXT={none:"Read-only requested - enforce with host tool restrictions",
    allowlist:"Allowlist - only the named write tools below",
    allow:"Full write - every mutating tool permitted"};
  const L=[`# Agent approval - ${v("scName")||"(unnamed)"}`,"",
    `**Decision:** ${decision}`,
    `**Owner:** ${v("scOwner")||"_UNASSIGNED - do not approve without a named owner_"}`,
    `**Requested by:** ${v("scRequester")||"_not stated_"}`,
    `**Review by:** ${v("scReview")||"_not set_"}`,
    `**AI tool:** ${TOOLS[tool].label} - enforce tool limits and approvals there`,"",
    "## Gates","",
    ...SCOPE_GATES.map(g=>`- [${gates.includes(g)?"x":" "}] ${g}`),""];
  if(!allGates) L.push("> **Not all gates are met.** Approve as a pilot at most, and record why.","");
  L.push("## Reach granted","",
    "**Access granted (MCP):** "+(reach.length?reach.map(e=>`${e.name} (\`${serverOf(e)}\`)`).join(", "):"_none_"),"",
    "**Context only (no access):** "+(plain.length?plain.map(e=>e.name).join(", "):"_none_"),"",
    "**May delegate to:** "+(subs.length?subs.join(", "):"_none_"),"");
  if(subs.length) L.push("Reach is inherited: the tools those readers open are effectively in scope too.","");
  L.push("## Safety","",
    `- **Write access:** ${WRITE_TXT[write]}`);
  if(write!=="none") L.push(`- **Named write tools / approver:** ${v("scWriteList")||"_NOT SPECIFIED - required before approval_"}`);
  L.push("- **Approval is human:** require an explicit approval control in the host before material changes.",
    "- **Redaction:** require redaction of sensitive data and verify it; these instructions do not enforce filtering.","",
    "## Cost","",
    `- **Model tier:** ${tierText(model, tool)}`,
    "- Verify model availability and cost limits in your host; delegation is not a spending control.","");
  if(v("scNotes")) L.push("## Conditions","", v("scNotes"),"");
  L.push("## Rollout","",
    "1. Pilot with the requester on known-answer cases for a week.",
    "2. Check the output uses a shared template so reports stay comparable.",
    "3. Share reviewed definitions through version control.",
    "4. Re-review on the date above; retire if unused.");
  if(write==="allow") L.push("","> **Full write access is unusual.** Confirm this is genuinely required, and prefer an allowlist.");
  out.textContent=L.join("\n");
}

/* Reads the Agent Builder. Tools and delegates keep the plan's order, so an unedited piece matches its starter file. */
function builderType(){ return document.getElementById("agKind")?.value==="worker" ? "sub" : "agent"; }
function builderConfig(){
  const val=id=>(document.getElementById(id)?.value||"").trim();
  const base=selectedPiece()?.config;
  const customSubs=val("agCustomSubs").split("\n").map(s=>s.trim()).filter(Boolean), worker=builderType()==="sub";
  return { name:val("agName"), file:val("agFile"), desc:val("agDesc"), hint:val("agHint"),
    tier:TIER_LABEL[val("agTier")] ? val("agTier") : "inherit", model:val("agModel"), worker,
    systems:orderEntries(base?.systems, readCatalog("ag")),
    subs:worker ? [] : orderLike(base?.subs, [...new Set([...agChecked("agSubs"),...customSubs])]),
    skill:base?.skill||"", adapt:!!document.getElementById("agAdapt")?.checked,
    rules:val("agRules").split("\n").map(r=>r.trim()).filter(Boolean) };
}
function orderLike(reference, values){
  const ref=reference||[], rank=v=>ref.includes(v) ? ref.indexOf(v) : ref.length;
  return [...values].sort((a,b)=>rank(a)-rank(b));
}
function orderEntries(reference, entries){
  const ids=(reference||[]).map(e=>e.id), rank=e=>ids.includes(e.id) ? ids.indexOf(e.id) : ids.length;
  return [...entries].sort((a,b)=>rank(a)-rank(b));
}
/* Readers on offer: the plan's readers and one per MCP server ticked in the builder. Ticks survive a rebuild. */
function delegateOptions(extra){
  const plan=createPieces().filter(p=>p.type==="sub").map(p=>p.name);
  return [...new Set([...plan, ...readerGroups(readCatalog("ag")).map(g=>g.name), ...(extra||[])])];
}
function renderDelegates(checked){
  const wrap=document.getElementById("agSubs"); if(!wrap) return;
  const ticked=checked||agChecked("agSubs"), options=delegateOptions(ticked);
  const html=options.length ? options.map(name=>
    `<label><input type="checkbox" value="${esc(name)}" ${ticked.includes(name)?"checked":""} onchange="renderAgent()"/>${esc(name)}</label>`).join("")
    : '<p class="muted">Tick via MCP on a tool to get its reader.</p>';
  if(wrap.dataset.html!==html){ wrap.innerHTML=html; wrap.dataset.html=html; }
}
const KIND_LABELS = {
  copilot:["Agent - appears in the agents list","Subagent - hidden; other agents call it"],
  claude:["Agent - start it with claude --agent","Subagent - Claude Code or an agent calls it"],
  codex:["Agent - a skill you start with $name","Subagent - a custom agent Codex spawns"],
};
function modelSummary(c, tool){
  const exact=String(c.model||"").trim(), tier=c.tier||"inherit";
  if(tool==="codex" && !c.worker) return "the session's model";
  if(exact) return exact;
  if(tier==="inherit") return "inherit";
  const model=MODEL_TIERS[tool]?.[tier];
  return model ? `${TIER_LABEL[tier]} (${model})` : `${TIER_LABEL[tier]}, needs an exact ID`;
}
function modelNote(c, tool){
  const exact=String(c.model||"").trim(), tier=c.tier||"inherit";
  let text;
  if(tool==="codex" && !c.worker) text="Codex runs this skill on the session's model, so no model line is written.";
  else if(exact) text=tool==="codex" ? `Writes model = "${exact}".` : `Writes model: "${exact}".`;
  else if(tool==="claude") text=`Writes model: "${MODEL_TIERS.claude[tier]}".`;
  else if(tool==="codex") text=tier==="inherit" ? "No model line: uses the session's model." : `Writes model = "${MODEL_TIERS.codex[tier]}".`;
  else text=tier==="inherit" ? "No model line: uses the person's selected model."
    : "Copilot needs an exact model ID - add it below. Until then, the file uses the person's model.";
  return text+(c.worker ? " Tip: Fast suits a reader that only looks things up." : "");
}
function renderAgent(){
  const out=document.getElementById("agOut"); if(!out) return;
  const tool=currentTool();
  renderDelegates();
  const c=builderConfig();
  document.getElementById("agentBuilderTitle").textContent=c.worker ? "Subagent Builder" : "Agent Builder";
  const kind=document.getElementById("agKind");
  if(kind?.options) [...kind.options].forEach((option,i)=>{ option.textContent=KIND_LABELS[tool][i]; });
  // A subagent calls no readers: the lists hide, and their ticks wait for the Kind to change back.
  ["agSubsRow","agCustomSubsRow"].forEach(id=>{ const row=document.getElementById(id); if(row) row.hidden=c.worker; });
  const reach=c.systems.filter(e=>e.mcp), plain=c.systems.filter(e=>!e.mcp);
  const summary=[reach.length ? `Opens via MCP: ${reach.map(e=>e.name).join(", ")}.` : "",
    plain.length ? `Knows the team uses: ${plain.map(e=>e.name).join(", ")}.` : "",
    c.subs.length ? `Delegates to: ${c.subs.join(", ")}.` : "",
    `Model: ${modelSummary(c, tool)}.`].filter(Boolean);
  document.getElementById("agReach").textContent=reach.length || plain.length || c.subs.length
    ? summary.join(" ") : "No tools or delegates yet: built-in read and search only.";
  const modelOut=document.getElementById("agModelOut");
  if(modelOut) modelOut.textContent=modelNote(c, tool);
  const note=document.getElementById("agDelegateNote");
  if(note){
    const text=!c.subs.length || tool==="copilot" ? ""
      : tool==="claude" ? `Readers work only when you start this agent with claude --agent ${agentId(c.name,"claude")}: a subagent cannot call other subagents.`
      : `Run this agent as $${c.file} in the main session: it spawns the readers as subagents.`;
    note.hidden=!text; note.textContent=text;
  }
  const badIds=invalidServerIds(c.systems);
  const download=document.getElementById("agDlBtn");
  download.disabled=!!badIds.length;
  if(badIds.length){
    out.textContent="Invalid MCP server ID. Use letters, digits, hyphens and underscores only.";
    document.getElementById("status").textContent=`Fix the MCP server ID for ${badIds[0].name} before downloading.`;
    return;
  }
  if(/^Fix the MCP server ID/.test(document.getElementById("status").textContent)) document.getElementById("status").textContent="";
  const adaptRow=document.getElementById("agAdaptRow");
  if(adaptRow) adaptRow.hidden=c.worker;
  const skillNote=document.getElementById("agSkillNote");
  if(skillNote){
    skillNote.hidden=!c.skill;
    skillNote.innerHTML=c.skill ? `Follows the <code>${esc(c.skill)}</code> skill from your build plan.` : "";
  }
  out.textContent=agentFile(c, tool);
  const preview=document.getElementById("agPreviewTitle");
  if(preview) preview.textContent=tool==="codex" && c.worker ? "Preview generated TOML" : "Preview generated Markdown";
  const p=document.getElementById("agPath");
  if(p) p.textContent=validServer(c.file) ? piecePath(builderType(), c.file, tool) : "Enter a valid file name.";
  agentFilename();
}
/* Paths and wording that follow the chosen assistant, outside the generated files. */
const TOOL_FOLDERS = {
  copilot:{agents:".github/agents/", note:"The same files work in VS Code and in IntelliJ with the GitHub Copilot plugin. Prompts are written as skills because VS Code is phasing out <code>.prompt.md</code> files in favour of skills.",
    make:"The agent, subagents, skills and prompts to save in <code>.github/</code>, for VS Code or IntelliJ."},
  claude:{agents:".claude/agents/", note:"Claude Code loads agents from <code>.claude/agents</code> and skills from <code>.claude/skills</code>. Start an agent with <code>claude --agent &lt;name&gt;</code>; prompts are skills that run only when you type them.",
    make:"The agent, subagents, skills and prompts to save in <code>.claude/</code>."},
  codex:{agents:".codex/agents/", note:"Codex loads subagents from <code>.codex/agents</code> and skills from <code>.agents/skills</code>. An agent is a skill you start with <code>$name</code>; a prompt is a skill that runs only when you type it.",
    make:"The skills and subagents to save in <code>.agents/skills/</code> and <code>.codex/agents/</code>."},
};
function renderToolText(){
  const tool=currentTool(), folders=TOOL_FOLDERS[tool];
  const set=(id,text)=>{ const el=document.getElementById(id); if(el) el.textContent=text; };
  set("livesPrompt", piecePath("prompt","<name>",tool)); set("livesSkill", piecePath("skill","<name>",tool));
  set("livesAgent", piecePath("agent","<name>",tool)); set("livesSub", piecePath("sub","<name>",tool));
  set("egPrompt", promptCommand("release-readiness",tool)); set("egAgentDir", tool==="codex" ? ".agents/skills/ or .codex/agents/" : folders.agents);
  const note=document.getElementById("toolHelpNote");
  if(note) note.innerHTML=`${folders.note} A bigger request can need several of these: tick every part in question 5 and you get a build plan.`;
  const make=document.getElementById("makeAgentDesc"); if(make) make.innerHTML=folders.make;
  const tip=document.getElementById("agSaveTip");
  if(tip) tip.innerHTML=`Save the reviewed file in <code>${esc(tool==="codex" ? ".agents/skills/ or .codex/agents/" : folders.agents)}</code>. Server IDs and subagent names must match your own ${esc(TOOLS[tool].label)} setup; this page installs and connects nothing.`;
}

/* Shared by user-facing agents, skills and prompts so explanations follow the profile and progress created in Setup. */
const ADAPT_SECTION = [
  "## Working with the user","",
  "If `.mentor/profile.md` exists, read it before your first answer and adapt to the role and the",
  "time in that role recorded there:","",
  "- Under 2 years: define each term, use a concrete example and explain why.",
  "- 2 to under 4 years: assume the basics; compare alternatives and their consequences.",
  "- 4 to under 7 years: focus on trade-offs, integration and maintenance.",
  "- 7 years or more: be concise; state assumptions, risks and wider effects.","",
  "If `.mentor/progress.json` records the topic you are explaining, its state comes first: `new`",
  "means explain it with an example, `learning` means give a hint before the answer, and",
  "`independent` means keep it brief.","",
  "Use plain, concrete wording at every level, and reply in the explanation language from the",
  "profile. Never change these files.",""];
/* The instructions are the same for every assistant; only the frontmatter and the file format differ. */
function agentBody(c, tool){
  const subs=c.subs||[], entries=c.systems||[], rules=c.rules||[];
  const L=[`You are the ${c.name}.`,"",c.desc,""];
  if(c.hint) L.push("## Input","",
    `Work from: ${c.hint}. If something you need is missing, ${c.worker?"say what is missing":"ask for it"} instead of guessing.`,"");
  if(subs.length){
    L.push("## Delegation","",
      ...(tool==="codex"
        ? ["Delegate the evidence gathering to these custom agents. Spawn them as subagents, in parallel when",
           "the sources are independent, and wait for all of them before you conclude. Give each one every",
           "identifier, the exact question and the time window."]
        : ["Delegate only self-contained evidence gathering and keep the analysis. Pass every",
           "identifier, the exact question, and the time window in the task itself. Run independent sources in",
           "parallel; escalate serially only when one answer decides the next question."]),"",
      ...subs.map(s=>`- \`${agentId(s, tool)}\``), "",
      "Synthesize the results - never paste a subagent's raw output into your answer.","");
  }
  if(c.skill) L.push("## Procedure","",`Follow the \`${tool==="codex"?"$":""}${c.skill}\` skill for the fixed steps, in order.`,"");
  const stack=stackSection(entries);
  if(stack.length) L.push(...stack,"");
  const reach=systemsSection(entries, !!c.worker, tool);
  if(reach.length) L.push(...reach,"");
  if(c.adapt && !c.worker) L.push(...ADAPT_SECTION);
  if(rules.length) L.push("## Boundaries","", ...rules.map(r=>`- ${r}`), "");
  L.push("## Output","",
    "Separate observed evidence (with its source) from inference. State your confidence and the smallest",
    "next verification. If the evidence is inconclusive, say so and name the missing input rather than guessing.");
  return L;
}
/* Pure, so the Agent Builder and the build plan write identical files.
   Copilot grants MCP servers as <server>/*, Claude Code as mcp__<server>__*; Codex agents inherit the
   servers configured for the session, so their files only say which ones to use. */
function agentFile(c, tool=currentTool()){
  const body=agentBody(c, tool), model=modelFor(c, tool), servers=mcpServers(c.systems);
  if(tool==="codex"){
    if(!c.worker) return skillMarkdown(c.file, c.desc, [`# ${c.name}`,"",...body], false, tool);
    const L=[`name = ${JSON.stringify(agentId(c.name,"codex"))}`, `description = ${JSON.stringify(c.desc)}`];
    if(model) L.push(`model = ${JSON.stringify(model)}`, ...(String(c.model||"").trim() ? [] : ['model_reasoning_effort = "high"']));
    const text=body.join("\n");
    // A literal multi-line string keeps backslashes and quotes as written.
    L.push(`developer_instructions = ${text.includes("'''") ? JSON.stringify(text) : `'''\n${text}\n'''`}`);
    return L.join("\n");
  }
  if(tool==="claude"){
    const subs=(c.subs||[]).map(s=>agentId(s,"claude"));
    const tools=["Read","Grep","Glob",...(subs.length?[`Agent(${subs.join(", ")})`]:[]),...servers.map(s=>`mcp__${s}__*`)];
    const L=["---",`name: ${agentId(c.name,"claude")}`,`description: ${JSON.stringify(c.desc)}`,`tools: ${tools.join(", ")}`];
    if(c.skill) L.push("skills:",`  - ${c.skill}`);
    if(model) L.push(`model: ${JSON.stringify(model)}`);
    return [...L,"---","",...body].join("\n");
  }
  const tools=["read","search",...((c.subs||[]).length?["agent"]:[]),...servers.map(s=>`${s}/*`)];
  const L=["---",`name: ${JSON.stringify(c.name)}`,`description: ${JSON.stringify(c.desc)}`,`tools: [${tools.join(", ")}]`];
  if(c.skill) L.push(`skills: [${c.skill}]`);
  if(model) L.push(`model: ${JSON.stringify(model)}`);
  if(c.worker) L.push("user-invocable: false");
  return [...L,"---","",...body].join("\n");
}

/* ---------------- Setup: mentor profile (generated files only; nothing is stored) ---------------- */
const MENTOR_ROLES = {
  developer:{label:"Developer", perspective:"engineer"},
  qa:{label:"QA engineer", perspective:"engineer"},
  business:{label:"Business analyst", perspective:"business"},
  manager:{label:"Manager", perspective:"manager"},
};
/* Users pick a band instead of typing years: no default, no decimal separators, and the band is the level. */
const MENTOR_BANDS = {
  lt2:{label:"Under 2 years", level:"Junior", help:"step by step, with hints before answers", mode:"guided"},
  "2to4":{label:"2 to under 4 years", level:"Intermediate", help:"your approach first, then edge cases", mode:"collaborative"},
  "4to7":{label:"4 to under 7 years", level:"Upper intermediate", help:"alternatives, trade-offs and how to verify", mode:"collaborative"},
  "7plus":{label:"7 years or more", level:"Senior", help:"short peer review of assumptions and risks", mode:"direct"},
};
const MENTOR_MODES = {
  guided:"Guided - questions and hints before solutions",
  collaborative:"Collaborative - I propose, we refine it together",
  direct:"Direct - the answer first, then a short explanation",
};
function setupState(){
  const v=id=>(document.getElementById(id)?.value||"").trim();
  const lines=id=>v(id).split("\n").map(x=>x.trim()).filter(Boolean);
  const band=MENTOR_BANDS[v("suBand")] ? v("suBand") : "";
  return { role:MENTOR_ROLES[v("suRole")] ? v("suRole") : "developer", band, level:MENTOR_BANDS[band]||null,
    mode:MENTOR_MODES[v("suMode")] ? v("suMode") : MENTOR_BANDS[band]?.mode || "",
    lang:v("suLang")||"English", topics:lines("suTopics"), prefs:lines("suPrefs") };
}
function profileMarkdown(s){
  return ["# Mentor profile","",
    "Your mentor reads this file at the start of every session. Edit it whenever something changes.",
    "Keep it personal: do not commit it.","",
    `- Role: ${MENTOR_ROLES[s.role].label}`,
    `- Time in this role: ${s.level.label} (${s.level.level.toLowerCase()})`,
    `- Working mode: ${MENTOR_MODES[s.mode]}`,
    `- Explanation language: ${s.lang}`,"",
    "## Topics I'm working on","",
    ...(s.topics.length ? s.topics.map(t=>`- ${t}`) : ["- None yet. The mentor will ask."]),"",
    "## Preferences","",
    ...(s.prefs.length ? s.prefs.map(p=>`- ${p}`) : ["- None."]),""].join("\n");
}
/* The same file for everyone: role, level and mode come from each person's profile. */
const MENTOR_DESC = "Use when you want to learn while you work. Adapts questions, hints and explanations to your role, experience and progress recorded in .mentor/.";
const MENTOR_FILES = {
  copilot:{download:"mentor.agent.md", path:".github/agents/mentor.agent.md", user:"~/.copilot/agents/mentor.agent.md"},
  claude:{download:"mentor.md", path:".claude/agents/mentor.md", user:"~/.claude/agents/mentor.md"},
  codex:{download:"mentor-SKILL.md", path:".agents/skills/mentor/SKILL.md", user:"~/.agents/skills/mentor/SKILL.md"},
};
const MENTOR_BODY = [
  "You are a mentor. Help the user finish their task and learn from it. Adapt how much you explain,",
  "and how much of the solution you give, to the user's role, experience and recorded progress.",
  "",
  "## Session start",
  "",
  ...[
    ["Read `.mentor/profile.md`. If it is missing, ask for the user's role, time in that role,",
     "preferred working mode and explanation language. Then create the file with these lines:",
     "`- Role:`, `- Time in this role:`, `- Working mode:` and `- Explanation language:`."],
    ["Read `.mentor/progress.json` if it exists. If it is missing, start with no recorded topics.",
     "If it is not valid JSON, do not overwrite it: explain the problem and continue without it."],
    ["Treat topics last seen more than 90 days ago as unconfirmed. Ask one question before relying on them."],
    ["Say in one sentence how you will work today, for example: \"I'll give hints before solutions.",
     "Say 'show me' when you want the answer.\""],
  ].flatMap((step,i)=>step.map((line,j)=>j ? "   "+line : `${i+1}. ${line}`)),
  "",
  "## Experience",
  "",
  "Use the level that matches \"Time in this role\". For a topic recorded in `progress.json`, the topic",
  "state takes precedence over the level.",
  "",
  "| Level | Time in the role | How you work | How you explain |",
  "|---|---|---|---|",
  "| Junior | Under 2 years | Split the task into small steps. Ask for a prediction or one idea per step. | Define each term the first time. Use a concrete example. Explain why, not only what. |",
  "| Intermediate | 2 to under 4 years | Ask for their approach and the reason for it, then discuss edge cases. | Assume the basics. Compare alternatives and their consequences. |",
  "| Upper intermediate | 4 to under 7 years | Ask for alternatives, constraints and how they would verify the result. | Focus on trade-offs, integration and maintenance. |",
  "| Senior | 7 years or more | Act as a critical peer: challenge assumptions and look for risks. | Be concise. State assumptions, risks and wider effects explicitly. |",
  "",
  "| Topic state | What you do |",
  "|---|---|",
  "| new | Explain the concept with a concrete example, then ask one question. |",
  "| learning | Give progressive hints and ask the user to take the next step. |",
  "| independent | Ask for their approach first, then discuss edge cases. |",
  "",
  "## Role",
  "",
  "| Role | What to ask about |",
  "|---|---|",
  "| Developer | Where the logic belongs, which design to choose, which edge cases exist, how to test it. |",
  "| QA engineer | What could break, which test conditions and data are needed, expected versus actual result, how to reproduce it. |",
  "| Business analyst | Which business rule applies, who is affected, what the acceptance criteria are, what \"correct\" looks like. |",
  "| Manager | Which decision is needed, the risks and priorities, the capacity it takes, what information is missing. |",
  "",
  "## Working mode",
  "",
  "- Guided: do not start with the full solution. Ask one main question per turn. Increase support one",
  "  step at a time: guiding question, concrete hint, partial example, explained solution, then a small",
  "  variation for the user to solve alone.",
  "- Collaborative: ask for the user's proposal first, then improve it together.",
  "- Direct: give the answer first, then a short explanation and one question that checks understanding.",
  "",
  "Give the full answer at once when the user asks for it (\"show me\"), is still blocked after the hints,",
  "or is handling an urgent incident.",
  "",
  "## Language",
  "",
  "Use plain, concrete wording at every level: short sentences, one idea per sentence and no unexplained",
  "abbreviations. Senior does not mean jargon, and junior does not mean childish. Reply in the",
  "explanation language from the profile.",
  "",
  "## Feedback",
  "",
  "After each answer, say what is correct, what to change and why. Then check understanding with a new,",
  "slightly different case.",
  "",
  "## Saving progress",
  "",
  "When the user says \"save progress\", or the task is finished:",
  "",
  "1. Re-read `.mentor/progress.json`. List each change as old -> new, with evidence from this session.",
  "2. Mark a topic `independent` only after the user solved a new problem on it without hints.",
  "3. Write the complete file as valid JSON with at most 30 topics. `state` is `new`, `learning` or",
  "   `independent`, and dates use YYYY-MM-DD. For example:",
  "",
  "   ```json",
  "   {\"schemaVersion\": 1, \"updated\": \"2026-01-31\", \"nextGoal\": \"Apply boundary values to a date field\",",
  "    \"topics\": [{\"name\": \"Boundary values\", \"state\": \"learning\",",
  "                \"evidence\": \"Found the maximum-length boundary after two hints\", \"lastSeen\": \"2026-01-31\"}]}",
  "   ```",
  "",
  "4. Do not edit `.mentor/profile.md` after creating it. Suggest changes in chat instead.",
  "",
  "## Boundaries",
  "",
  "- Edit only files in `.mentor/`. Never edit source code or any other file: show code in chat for the",
  "  user to apply.",
  "- Record only learning observations about topics. Never record code, customer data, secrets,",
  "  colleagues' names or judgements about the person.",
  "",
];
/* Copilot and Claude Code run the Mentor as an agent; Codex runs it as a skill the user starts with $mentor. */
function mentorFile(tool=currentTool()){
  const head = tool==="claude" ? ["---","name: mentor",`description: ${JSON.stringify(MENTOR_DESC)}`,"tools: Read, Grep, Glob, Edit, Write","---"]
    : tool==="codex" ? ["---","name: mentor",`description: ${JSON.stringify(MENTOR_DESC)}`,"---"]
    : ["---",'name: "Mentor"',`description: ${JSON.stringify(MENTOR_DESC)}`,"tools: [read, search, edit]","---"];
  const intro = tool==="codex" ? ["# Mentor","","Follow these instructions for the rest of this conversation.",""] : [];
  return {...MENTOR_FILES[tool], content:[...head,"",...intro,...MENTOR_BODY].join("\n")};
}
function renderSetup(){
  const out=document.getElementById("suProfileOut"); if(!out) return;
  const s=setupState(), valid=!!s.level, mentor=mentorFile();
  ["suProfileCopy","suProfileDl","suBothDl"].forEach(id=>{ const b=document.getElementById(id); if(b) b.disabled=!valid; });
  document.getElementById("suLevel").textContent = valid
    ? `${s.level.level}: ${s.level.help}. Recommended mode: ${MENTOR_MODES[s.level.mode].split(" - ")[0]}.`
    : "Choose your time in this role to create your profile.";
  out.textContent = valid ? profileMarkdown(s) : "Choose your time in this role to create your profile.";
  const agent=document.getElementById("suAgentOut");
  if(agent) agent.textContent=mentor.content;
  const path=document.getElementById("suAgentPath");
  if(path) path.textContent=mentor.path;
  const user=document.getElementById("suUserPath");
  if(user) user.textContent=mentor.user;
  renderSetupCommands();
  renderSetupIde();
}
function setupBandChanged(){
  syncSmallestDefault();
  rememberChoices();
  renderSetup(); renderNeed();
}
/* "Just me" keeps both files out of Git on this computer; "My whole team" shares the Mentor through a pull request. */
function renderSetupCommands(){
  const ps=document.getElementById("suCmdPs"), sh=document.getElementById("suCmdSh");
  if(!ps || !sh) return;
  const team=!!document.getElementById("suInstallTeam")?.checked, mentor=mentorFile();
  const dir=mentor.path.slice(0, mentor.path.lastIndexOf("/")), win=path=>path.split("/").join("\\");
  const exclude=[".mentor/"].concat(team ? [] : [mentor.path]);
  ps.textContent=[`New-Item -ItemType Directory -Force .mentor, ${win(dir)} | Out-Null`,
    'Move-Item "$HOME\\Downloads\\profile.md" .mentor\\profile.md',
    `Move-Item "$HOME\\Downloads\\${mentor.download}" ${win(mentor.path)}`,
    ...exclude.map(path=>`Add-Content (git rev-parse --git-path info/exclude) "${path}"`)].join("\n");
  sh.textContent=[`mkdir -p .mentor ${dir}`,
    "mv -n ~/Downloads/profile.md .mentor/profile.md",
    `mv -n ~/Downloads/${mentor.download} ${mentor.path}`,
    ...exclude.map(path=>`echo "${path}" >> "$(git rev-parse --git-path info/exclude)"`)].join("\n");
  document.getElementById("suInstallNote").textContent=team
    ? `Commit ${mentor.path} in a pull request once your team agrees. Never commit .mentor/: it holds your personal profile and progress.`
    : "Both files stay out of Git on this computer only. Nobody else gets the mentor until you choose to share it.";
}
function downloadMentor(){ const mentor=mentorFile(); downloadText(mentor.download, mentor.content, "text/markdown"); }
function downloadSetupFiles(){
  if(!setupState().level) return;
  downloadText("profile.md", document.getElementById("suProfileOut").textContent, "text/markdown");
  setTimeout(downloadMentor, 600);
}
/* Copilot runs in VS Code or IntelliJ, each with its own steps; Claude Code and Codex have one set each. */
function renderSetupIde(){
  const tool=currentTool(), ide=document.getElementById("suIde")?.value==="intellij" ? "intellij" : "vscode";
  document.querySelectorAll("[data-ide]").forEach(el=>{ el.hidden=tool!=="copilot" || el.dataset.ide!==ide; });
}

/* Builds the page once. The tests load everything above this line without running it. */
function initPage(){
  buildCatalog("ag"); renderDelegates([]);
  [["agCopyBtn",ICON_COPY],["agDlBtn",ICON_DL]].forEach(([id,label])=>{ const el=document.getElementById(id); if(el) el.textContent=label; });
  buildBriefChecks();
  buildNeedUI();
  setTool(currentTool());
  setUserRole("developer");
  restoreRemembered();
  paintNeed();
  ["input","change"].forEach(type=>document.getElementById("build").addEventListener(type,createInput));
  // A click on the dimmed area around the About dialog lands on the dialog itself and closes it.
  document.getElementById("aboutDialog").addEventListener("click",event=>{ if(event.target.id==="aboutDialog") closeAbout(); });
  document.getElementById("aboutDialog").addEventListener("close",aboutClosed);
  renderCreateSource(null); renderCreateFiles();
  const requestedSection=location.hash.slice(1);
  go(requestedSection);
  showStepZero(!requestedSection);
  if(window.matchMedia("(prefers-color-scheme: dark)").matches) toggleTheme();
}
initPage();
