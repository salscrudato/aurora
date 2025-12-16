#!/usr/bin/env ts-node
/**
 * Export all backend code to a single comprehensive text file
 * Includes full file paths and complete code snippets
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC_DIR = path.join(__dirname, '../src');
const SCRIPTS_DIR = path.join(__dirname, '../scripts');
const ROOT_DIR = path.join(__dirname, '..');
const OUTPUT_FILE = path.join(ROOT_DIR, 'COMPLETE_BACKEND_CODE.txt');

interface FileEntry {
  path: string;
  relativePath: string;
  content: string;
  lines: number;
}

function getAllTypeScriptFiles(dir: string, baseDir: string = ''): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.join(baseDir, entry.name);

    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
        files.push(...getAllTypeScriptFiles(fullPath, relativePath));
      }
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

function countLines(content: string): number {
  return content.split('\n').length;
}

async function main() {
  console.log('📦 Exporting Complete Backend Code\n');

  const srcFiles = getAllTypeScriptFiles(SRC_DIR).sort();
  const scriptFiles = getAllTypeScriptFiles(SCRIPTS_DIR)
    .filter(f => !f.includes('export-complete-backend.ts'))
    .sort();

  const allFiles = [...srcFiles, ...scriptFiles];
  const entries: FileEntry[] = [];

  let totalLines = 0;
  let totalSize = 0;

  // Read all files
  for (const filePath of allFiles) {
    const content = readFile(filePath);
    const lines = countLines(content);
    const relativePath = path.relative(ROOT_DIR, filePath);

    entries.push({
      path: filePath,
      relativePath,
      content,
      lines,
    });

    totalLines += lines;
    totalSize += content.length;

    console.log(`  ✓ ${relativePath} (${lines} lines)`);
  }

  // Generate output
  let output = '';
  output += '='.repeat(80) + '\n';
  output += 'AURORANOTES BACKEND - COMPLETE CODE EXPORT\n';
  output += `Generated: ${new Date().toISOString()}\n`;
  output += `Total Files: ${entries.length}\n`;
  output += `Total Lines: ${totalLines.toLocaleString()}\n`;
  output += `Total Size: ${(totalSize / 1024).toFixed(1)} KB\n`;
  output += '='.repeat(80) + '\n\n';

  // Table of contents
  output += 'TABLE OF CONTENTS\n';
  output += '-'.repeat(80) + '\n';
  entries.forEach((entry, idx) => {
    output += `${String(idx + 1).padStart(2, ' ')}. ${entry.relativePath}\n`;
  });
  output += '\n';

  // File contents
  for (const entry of entries) {
    output += '='.repeat(80) + '\n';
    output += `FILE: ${entry.relativePath}\n`;
    output += `LINES: ${entry.lines}\n`;
    output += `PATH: ${entry.path}\n`;
    output += '='.repeat(80) + '\n\n';
    output += entry.content;
    output += '\n\n';
  }

  // Write output
  fs.writeFileSync(OUTPUT_FILE, output, 'utf-8');

  console.log('\n' + '='.repeat(80));
  console.log('✅ Export complete!');
  console.log(`   Output: ${OUTPUT_FILE}`);
  console.log(`   Files: ${entries.length}`);
  console.log(`   Lines: ${totalLines.toLocaleString()}`);
  console.log(`   Size: ${(totalSize / 1024).toFixed(1)} KB`);
  console.log('='.repeat(80) + '\n');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

