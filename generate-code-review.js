#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Configuration
const ROOT_DIR = process.cwd();
const OUTPUT_FILE = path.join(ROOT_DIR, 'CODE_REVIEW.md');
const EXCLUDE_DIRS = ['node_modules', 'dist', '.git', '.next', 'build', 'coverage'];
const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.json', '.yml', '.yaml', '.md'];

let markdownContent = '# Code Review - Complete Codebase\n\n';
markdownContent += `Generated: ${new Date().toISOString()}\n\n`;
markdownContent += '## Table of Contents\n\n';

const fileList = [];

function walkDir(dir, relativePath = '') {
  try {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const relPath = relativePath ? path.join(relativePath, file) : file;
      
      // Skip excluded directories
      if (EXCLUDE_DIRS.includes(file)) continue;
      
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        walkDir(fullPath, relPath);
      } else if (stat.isFile()) {
        const ext = path.extname(file);
        if (CODE_EXTENSIONS.includes(ext)) {
          fileList.push({ fullPath, relPath });
        }
      }
    }
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err.message);
  }
}

// Walk the directory tree
walkDir(ROOT_DIR);

// Sort files by path
fileList.sort((a, b) => a.relPath.localeCompare(b.relPath));

// Generate table of contents
fileList.forEach((file, index) => {
  const anchor = file.relPath.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  markdownContent += `${index + 1}. [${file.relPath}](#${anchor})\n`;
});

markdownContent += '\n---\n\n';

// Add file contents
fileList.forEach((file) => {
  try {
    const content = fs.readFileSync(file.fullPath, 'utf-8');
    const anchor = file.relPath.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    
    markdownContent += `## ${file.relPath}\n\n`;
    markdownContent += `**Path:** \`${file.relPath}\`\n\n`;
    
    const ext = path.extname(file.relPath).slice(1) || 'text';
    markdownContent += '```' + ext + '\n';
    markdownContent += content;
    markdownContent += '\n```\n\n';
    markdownContent += '---\n\n';
  } catch (err) {
    console.error(`Error reading file ${file.relPath}:`, err.message);
  }
});

// Write the markdown file
fs.writeFileSync(OUTPUT_FILE, markdownContent, 'utf-8');
console.log(`✓ Code review file generated: ${OUTPUT_FILE}`);
console.log(`✓ Total files included: ${fileList.length}`);
console.log(`✓ File size: ${(fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2)} MB`);

