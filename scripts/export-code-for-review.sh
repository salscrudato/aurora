#!/bin/bash

# Export all backend code files to a single text file for external code review
# Output: code-review-export.txt in the repository root

OUTPUT_FILE="code-review-export.txt"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$REPO_ROOT"

# Clear/create output file
> "$OUTPUT_FILE"

echo "Exporting backend code files to $OUTPUT_FILE..."

# Header
echo "=================================================================================" >> "$OUTPUT_FILE"
echo "AuroraNotes API - Code Review Export" >> "$OUTPUT_FILE"
echo "Generated: $(date)" >> "$OUTPUT_FILE"
echo "=================================================================================" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Function to add a file to the export
add_file() {
    local file="$1"
    if [ -f "$file" ]; then
        echo "" >> "$OUTPUT_FILE"
        echo "=================================================================================" >> "$OUTPUT_FILE"
        echo "FILE: $file" >> "$OUTPUT_FILE"
        echo "=================================================================================" >> "$OUTPUT_FILE"
        echo "" >> "$OUTPUT_FILE"
        cat "$file" >> "$OUTPUT_FILE"
        echo "" >> "$OUTPUT_FILE"
        echo "Added: $file"
    fi
}

# Export source files (src/)
echo "" >> "$OUTPUT_FILE"
echo "### SOURCE CODE (src/) ###" >> "$OUTPUT_FILE"
for file in $(find src -name "*.ts" | sort); do
    add_file "$file"
done

# Export scripts
echo "" >> "$OUTPUT_FILE"
echo "### SCRIPTS (scripts/) ###" >> "$OUTPUT_FILE"
for file in $(find scripts -name "*.ts" -o -name "*.sh" | sort); do
    add_file "$file"
done

# Export config files
echo "" >> "$OUTPUT_FILE"
echo "### CONFIGURATION FILES ###" >> "$OUTPUT_FILE"
add_file "package.json"
add_file "tsconfig.json"
add_file "Dockerfile"
add_file ".env.example"

# Summary
echo "" >> "$OUTPUT_FILE"
echo "=================================================================================" >> "$OUTPUT_FILE"
echo "END OF EXPORT" >> "$OUTPUT_FILE"
echo "=================================================================================" >> "$OUTPUT_FILE"

# Count files and lines
FILE_COUNT=$(grep -c "^FILE:" "$OUTPUT_FILE")
LINE_COUNT=$(wc -l < "$OUTPUT_FILE" | tr -d ' ')

echo ""
echo "✅ Export complete!"
echo "   Output: $OUTPUT_FILE"
echo "   Files exported: $FILE_COUNT"
echo "   Total lines: $LINE_COUNT"

