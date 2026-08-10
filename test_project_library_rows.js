const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const source = fs.readFileSync(path.join(root, 'mvp-step02-r13.js'), 'utf8');

const renderStart = source.indexOf('  function renderProjects()');
const renderEnd = source.indexOf('  function renderTeam()', renderStart);
assert(renderStart >= 0 && renderEnd > renderStart, 'renderProjects is missing');

const renderer = source.slice(renderStart, renderEnd);

[
  "state.projects.map(project => ({...project, projectKind:'redraw'}))",
  "state.scriptProjects.map(project => ({...project, projectKind:'script'}))",
  "const matchesType = selectedType === 'all' || selectedType === project.projectKind;",
  "'data-project-id'",
  "'data-script-project-id'"
].forEach(token => assert(renderer.includes(token), `missing project library contract: ${token}`));

assert(!renderer.includes('创建小说短剧项目后'), 'empty state must not reference script-only projects');
assert(renderer.includes('创建项目后，它会出现在这里并从当前质量门继续。'), 'empty state must cover both project kinds');

console.log('project library rows contract verified');
