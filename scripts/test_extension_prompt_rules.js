// Prompt guards for the scalar project rules in extension/content.js.
//
// Rule 13d (project technologies) and 13e (project description) must only fill when
// the prompt is about the saved project itself, not when it is an essay question that
// merely mentions projects ("describe your project management experience").
//
// Run with: node scripts/test_extension_prompt_rules.js

const fs = require("fs");
const path = require("path");

const contentPath = path.join(__dirname, "..", "extension", "content.js");
const source = fs.readFileSync(contentPath, "utf8");

const start = source.indexOf("const PROJECT_SUBJECT");
const end = source.indexOf("function savedAnswerFor");
if (start < 0 || end < 0 || end < start) {
  console.error("Could not find the project prompt guards in extension/content.js");
  process.exit(1);
}

// The guards live at module scope inside content.js; evaluate just that slice.
const guards = new Function(
  source.slice(start, end) +
    "\nreturn { asksAboutProjectItself, asksAboutProjectTechnologies };"
)();
const { asksAboutProjectItself, asksAboutProjectTechnologies } = guards;

// content.js lowercases the prompt/name/id/placeholder text and turns -/_ into spaces.
const normalize = (text) => text.toLowerCase().replace(/[-_]/g, " ");

const description = {
  fill: [
    "describe a project you built",
    "project description",
    "project_description",
    "project details",
    "tell us about a project you worked on",
    "describe your most challenging project",
    "tell us about a project you're proud of",
    "describe the project you created",
    "describe a project you developed from scratch",
    "briefly describe the project and what it does",
  ],
  skip: [
    "describe your project management experience",
    "tell us about a project you managed",
    "describe a time you had to manage a project",
    "describe your experience leading projects",
    "what is your experience with project management tools",
    "describe your project planning process",
    "project name",
    "project url",
    "tell us about yourself",
    "why do you want this job",
    "describe a project that demonstrates your experience",
  ],
};

const technologies = {
  fill: [
    "project technologies",
    "project_technologies",
    "list the technologies used for this project",
    "tech stack for the project",
    "project tech stack",
    "what tools did you use to build the project",
    "which frameworks did you use for your project",
    "what languages was this project written in",
    "describe the tools you used on this project",
  ],
  skip: [
    "what project management tools do you use",
    "what tools do you use for project management",
    "describe your experience with project management tools",
    "what project planning tools are you comfortable with",
    "tell us about a project you managed using agile tools",
    "project name",
    "project url",
    "project description",
    "describe a project you built",
    "which tools do you use in your day to day work",
  ],
};

const suites = [
  { name: "13e project description", predicate: asksAboutProjectItself, cases: description },
  { name: "13d project technologies", predicate: asksAboutProjectTechnologies, cases: technologies },
];

let failures = 0;
for (const suite of suites) {
  for (const prompt of suite.cases.fill) {
    if (!suite.predicate(normalize(prompt))) {
      failures++;
      console.log(`FAIL ${suite.name} should fill: ${prompt}`);
    }
  }
  for (const prompt of suite.cases.skip) {
    if (suite.predicate(normalize(prompt))) {
      failures++;
      console.log(`FAIL ${suite.name} should not fill: ${prompt}`);
    }
  }
}

if (failures > 0) {
  console.log(`${failures} failing prompt case(s)`);
  process.exit(1);
}

console.log("all project prompt cases passed");
