#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');

// Temporary, narrowly scoped exception for the known transitive development
// dependency advisory in braces. Remove this entry once upstream publishes a
// fixed release and the dependency tree no longer reports this GHSA.
const ALLOWED_ADVISORIES = new Set(['GHSA-VFJ7-8CJW-P6XM']);
const BLOCKING_SEVERITIES = new Set(['high', 'critical']);

function runNpm(args) {
  const result = spawnSync('npm', args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true,
  });

  if (result.error) {
    console.error(`Failed to run npm ${args.join(' ')}: ${result.error.message}`);
    process.exit(2);
  }

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function printOutput(result) {
  if (result.stdout.trim()) process.stdout.write(result.stdout.endsWith('\n') ? result.stdout : `${result.stdout}\n`);
  if (result.stderr.trim()) process.stderr.write(result.stderr.endsWith('\n') ? result.stderr : `${result.stderr}\n`);
}

console.log('== Blocking audit: production dependencies ==');
const productionAudit = runNpm(['audit', '--omit=dev', '--audit-level=high']);
printOutput(productionAudit);
if (productionAudit.status !== 0) {
  console.error('FAIL: production dependency audit failed.');
  process.exit(1);
}

console.log('\n== Full audit: production and development dependencies ==');
const fullAudit = runNpm(['audit', '--json']);
if (fullAudit.stderr.trim()) process.stderr.write(`${fullAudit.stderr}\n`);

let report;
try {
  report = JSON.parse(fullAudit.stdout);
} catch (error) {
  console.error('FAIL: npm audit did not return valid JSON; refusing to skip the audit.');
  if (fullAudit.stdout.trim()) process.stdout.write(`${fullAudit.stdout}\n`);
  console.error(error.message);
  process.exit(1);
}

const vulnerabilities = report.vulnerabilities || {};
const packageNames = Object.keys(vulnerabilities).sort();
const totals = report.metadata?.vulnerabilities || {};
console.log(`Audit summary: ${totals.total ?? packageNames.length} vulnerable package entries; ` +
  `${totals.high ?? 0} high, ${totals.critical ?? 0} critical.`);

if (packageNames.length === 0) {
  if (fullAudit.status !== 0) {
    console.error('FAIL: npm audit returned a non-zero status without reporting package details.');
    process.exit(1);
  }
  console.log('PASS: full dependency audit found no vulnerable packages.');
  process.exit(0);
}

for (const name of packageNames) {
  const item = vulnerabilities[name];
  const via = (item.via || []).map((entry) =>
    typeof entry === 'string' ? entry : `${entry.title || entry.name || 'advisory'} (${entry.url || 'URL unavailable'})`
  );
  console.log(`- ${name}: ${item.severity}; direct=${item.isDirect}; via=${via.join('; ') || 'not specified'}`);
}

function resolveAdvisories(packageName, path = new Set()) {
  if (path.has(packageName)) return { ids: new Set(), unresolved: false };
  const item = vulnerabilities[packageName];
  if (!item) return { ids: new Set(), unresolved: true };

  const nextPath = new Set(path);
  nextPath.add(packageName);
  const ids = new Set();
  let unresolved = false;

  for (const via of item.via || []) {
    if (typeof via === 'string') {
      const nested = resolveAdvisories(via, nextPath);
      for (const id of nested.ids) ids.add(id);
      unresolved ||= nested.unresolved;
      continue;
    }

    const url = typeof via.url === 'string' ? via.url : '';
    const match = url.match(/GHSA-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}/i);
    if (match) {
      ids.add(match[0].toUpperCase());
    } else {
      // Unknown advisory identifiers fail closed; never silently allow them.
      ids.add(`UNIDENTIFIED:${url || via.title || via.name || packageName}`);
    }
  }

  if ((item.via || []).length === 0) unresolved = true;
  return { ids, unresolved };
}

const failures = [];
const allowedPackages = new Set();
for (const name of packageNames) {
  const item = vulnerabilities[name];
  if (!BLOCKING_SEVERITIES.has(item.severity)) continue;

  const resolved = resolveAdvisories(name);
  const ids = [...resolved.ids];
  const onlyAllowed = ids.length > 0 && ids.every((id) => ALLOWED_ADVISORIES.has(id));

  if (onlyAllowed && !resolved.unresolved) {
    allowedPackages.add(name);
  } else {
    failures.push({ name, ids, unresolved: resolved.unresolved });
  }
}

if (failures.length > 0) {
  console.error('\nFAIL: unapproved high/critical vulnerabilities remain.');
  for (const failure of failures) {
    console.error(`- ${failure.name}: ${failure.ids.join(', ') || 'advisory could not be resolved'}${failure.unresolved ? ' (dependency path unresolved)' : ''}`);
  }
  process.exit(1);
}

if (allowedPackages.size > 0) {
  console.warn('\nWARNING: the full audit still reports a known development dependency advisory.');
  console.warn(`Allowed advisory: ${[...ALLOWED_ADVISORIES].join(', ')}`);
  console.warn(`Affected package entries: ${[...allowedPackages].sort().join(', ')}`);
  console.warn('This is a temporary, explicit exception—not a claim that the advisory is fixed.');
}

console.log('PASS: no unapproved high/critical advisories were found.');
