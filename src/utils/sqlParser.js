/**
 * Utilities for parsing SQL-like table data from captured text
 */

/**
 * Extracts SQL query from text
 * @param {string} text - The text to search for SQL queries
 * @returns {string|null} - The extracted SQL query or null if not found
 */
export const extractSQLQuery = (text) => {
  if (!text) return null;
  
  // Look for SQL query patterns
  const sqlKeywords = /SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|JOIN|FROM|WHERE|GROUP BY|ORDER BY/i;
  
  // Try to find the query by looking for SQL keywords
  const lines = text.split('\n');
  let startLine = -1;
  let endLine = -1;
  
  // Find the start of the SQL query
  for (let i = 0; i < lines.length; i++) {
    if (sqlKeywords.test(lines[i])) {
      startLine = i;
      break;
    }
  }
  
  // If no SQL query found, return null
  if (startLine === -1) return null;
  
  // Find the end of the SQL query (typically ending with a semicolon)
  // If no semicolon, try to find where the query ends based on context
  for (let i = startLine; i < lines.length; i++) {
    if (lines[i].includes(';')) {
      endLine = i;
      break;
    }
    
    // If reached a line with output headers or results, stop there
    if (i > startLine && lines[i].includes('----') || 
        (i > startLine + 2 && lines[i].trim() === '' && lines[i+1] && lines[i+1].trim() !== '')) {
      endLine = i - 1;
      break;
    }
  }
  
  // If end not found, assume it's until the end
  if (endLine === -1) endLine = lines.length - 1;
  
  // Return the extracted query
  return lines.slice(startLine, endLine + 1).join('\n');
};

/**
 * Extracts information about what the SQL query is doing
 * @param {string} query - The SQL query
 * @returns {Object} - Information about the query
 */
export const analyzeQuery = (query) => {
  if (!query) return null;
  
  const lowerQuery = query.toLowerCase();
  
  const result = {
    isCountQuery: lowerQuery.includes('count('),
    hasFilter: lowerQuery.includes('where') || lowerQuery.includes('having'),
    tables: [],
    conditions: [],
    countTarget: null,
    filterField: null,
    filterOperator: null,
    filterValue: null
  };
  
  // Extract tables
  const fromMatch = lowerQuery.match(/from\s+([a-z0-9_,\s]+)(?:\s+where|\s+group|\s+having|\s+order|\s+limit|$)/i);
  if (fromMatch) {
    result.tables = fromMatch[1].split(',').map(t => t.trim());
  }
  
  // Extract count target
  const countMatch = lowerQuery.match(/count\(\s*(?:distinct\s+)?([a-z0-9_.*]+)\s*\)/i);
  if (countMatch) {
    result.countTarget = countMatch[1];
  }
  
  // Extract filter conditions - especially for score-related queries
  const whereMatch = lowerQuery.match(/where\s+(.+?)(?:\s+group|\s+having|\s+order|\s+limit|$)/i);
  if (whereMatch) {
    const whereClause = whereMatch[1];
    
    // Look for specific patterns like "score > 60"
    const scoreMatch = whereClause.match(/([a-z0-9_]+(?:score|mark|grade|point)[a-z0-9_]*)\s*([><=!]+)\s*(\d+)/i);
    if (scoreMatch) {
      result.filterField = scoreMatch[1];
      result.filterOperator = scoreMatch[2];
      result.filterValue = parseInt(scoreMatch[3], 10);
      result.conditions.push({
        field: result.filterField,
        operator: result.filterOperator,
        value: result.filterValue
      });
    }
    
    // Also check for other conditions
    const otherConditions = whereClause.split(/\s+and\s+|\s+or\s+/i);
    otherConditions.forEach(condition => {
      const condMatch = condition.match(/([a-z0-9_]+)\s*([><=!]+)\s*(['"]?[^'"\s]+['"]?)/i);
      if (condMatch && !result.conditions.some(c => c.field === condMatch[1])) {
        result.conditions.push({
          field: condMatch[1],
          operator: condMatch[2],
          value: condMatch[3].replace(/^['"]|['"]$/g, '')
        });
      }
    });
  }
  
  return result;
};

/**
 * Attempts to parse a table structure from text that looks like SQL results
 * @param {string} text - The text to parse for table data
 * @returns {Array|null} - Array of objects representing table rows, or null if parsing fails
 */
export const parseTableData = (text) => {
  if (!text) return null;
  
  // If this looks like a count query result
  if (/count|rows/i.test(text) && /\d+/.test(text)) {
    // Try to extract a number that looks like a count result
    const countMatch = text.match(/(\d+)(?:\s*rows?|\s*results?|\s*records?|\s*students?)?/i);
    if (countMatch) {
      const count = parseInt(countMatch[1], 10);
      
      // Create a simple result object with count
      return [{ 'count': count }];
    }
  }
  
  // Split into lines and filter out empty lines
  const lines = text.split('\n').filter(line => line.trim());
  
  // Early return if not enough lines
  if (lines.length < 3) return null;
  
  // Look for common table headers like StudentID, Name, Score, etc. to identify student data
  const studentDataPattern = /student|name|score|grade|math|english|science/i;
  
  // Look for lines that likely contain a structured table header
  let potentialHeaderIndices = [];
  for (let i = 0; i < Math.min(20, lines.length); i++) {
    const line = lines[i].trim();
    
    // Skip lines that are clearly not headers
    if (line.includes('SELECT') || line.includes('FROM') || line.includes('WHERE') || 
        line.includes('+--') || line.includes('|--') || line.includes('---')) {
      continue;
    }
    
    // Check if line has multiple words with reasonable column-like spacing
    const words = line.split(/\s{2,}|\|/).filter(word => word.trim());
    
    // Identify potential header rows by:
    // 1. Having multiple distinct columns (at least 2)
    // 2. Containing student data related terms OR having proper column-like structure
    if (words.length >= 2 && (
        studentDataPattern.test(line) || 
        words.some(w => /^id$/i.test(w.trim())) || 
        words.every(w => w.length < 20) // Reasonable column header length
    )) {
      potentialHeaderIndices.push(i);
    }
  }
  
  // For each potential header, try to extract a consistent table
  for (const headerIndex of potentialHeaderIndices) {
    const headerRow = lines[headerIndex];
    
    // Parse headers
    let headers = parseRowData(headerRow);
    
    // Clean up headers
    headers = headers.map(h => h.trim().replace(/^["'`]|["'`]$/g, ''));
    
    // Filter out empty headers
    const validHeaderIndices = [];
    const validHeaders = [];
    headers.forEach((header, idx) => {
      if (header.trim()) {
        validHeaderIndices.push(idx);
        validHeaders.push(header);
      }
    });
    
    // If no valid headers, skip this candidate
    if (validHeaders.length < 2) continue;
    
    // Parse data rows
    const dataRows = [];
    const startIndex = headerIndex + 1;
    
    // Skip separator rows
    let dataStartIndex = startIndex;
    while (dataStartIndex < lines.length && 
           (lines[dataStartIndex].includes('+--') || 
            lines[dataStartIndex].includes('|--') || 
            lines[dataStartIndex].includes('---+') || 
            lines[dataStartIndex].includes('---|'))) {
      dataStartIndex++;
    }
    
    // Track consecutive valid rows to ensure it's really a table
    let consecutiveValidRows = 0;
    const minRequiredConsecutiveRows = 2; // Need at least this many consistent rows
    
    // Parse each data row
    for (let i = dataStartIndex; i < Math.min(dataStartIndex + 30, lines.length); i++) {
      const line = lines[i].trim();
      
      // Skip empty lines and separator lines
      if (!line || line.includes('+--') || line.includes('|--') || 
          line.includes('---+') || line.includes('---|')) {
        continue;
      }
      
      // Skip lines that seem like SQL commands or metadata
      if (line.includes('SELECT') || line.includes('FROM') || line.includes('WHERE') ||
          line.match(/^\d+\s+rows?(\s+in\s+set)?/i)) {
        continue;
      }
      
      // Parse this line as a potential data row
      const rowData = parseRowData(line);
      
      // Check if this row has approximately the right number of columns
      if (Math.abs(rowData.length - headers.length) <= 1) {
        // Extract valid data using the header positions we identified
        const rowObj = {};
        validHeaders.forEach((header, j) => {
          if (j < rowData.length) {
            // Try to convert numeric values
            const value = rowData[j].trim();
            const numValue = parseFloat(value);
            rowObj[header] = !isNaN(numValue) ? numValue : value;
          } else {
            rowObj[header] = '';
          }
        });
        
        dataRows.push(rowObj);
        consecutiveValidRows++;
      } else {
        // If we found some rows but now found an inconsistent one, we might have reached the end
        if (consecutiveValidRows >= minRequiredConsecutiveRows) {
          break;
        }
        // Reset the counter if this row doesn't match our expected format
        consecutiveValidRows = 0;
      }
    }
    
    // If we found enough consistent rows, consider this a valid table
    if (consecutiveValidRows >= minRequiredConsecutiveRows || dataRows.length >= 2) {
      // Look for count-related information in the data
      if (dataRows.length === 1 && Object.keys(dataRows[0]).length === 1) {
        const onlyValue = Object.values(dataRows[0])[0];
        if (typeof onlyValue === 'number') {
          // This might be a count result, let's make it clear
          return [{ 'count': onlyValue }];
        }
      }
      
      // Special handling for student data - rename columns if needed for better visualization
      let hasRenamed = false;
      if (dataRows.length > 0) {
        const firstRow = dataRows[0];
        const keys = Object.keys(firstRow);
        
        // Look for name-like and score-like columns
        let nameColumn = null;
        let scoreColumn = null;
        
        for (const key of keys) {
          const lowerKey = key.toLowerCase();
          if (lowerKey.includes('name') || lowerKey.includes('student')) {
            nameColumn = key;
          } else if (lowerKey.includes('score') || lowerKey.includes('mark') || 
                     lowerKey.includes('grade') || lowerKey.includes('point')) {
            scoreColumn = key;
          }
        }
        
        // If we have name and score columns, ensure they're the first two for easier visualization
        if (nameColumn && scoreColumn && keys.length >= 2) {
          if (keys[0] !== nameColumn || keys[1] !== scoreColumn) {
            const newDataRows = dataRows.map(row => {
              const newRow = {};
              newRow['Student Name'] = row[nameColumn];
              newRow['Score'] = row[scoreColumn];
              
              // Include other columns
              for (const key of keys) {
                if (key !== nameColumn && key !== scoreColumn) {
                  newRow[key] = row[key];
                }
              }
              
              return newRow;
            });
            
            hasRenamed = true;
            return newDataRows;
          }
        }
      }
      
      // Return the parsed data rows
      return dataRows;
    }
  }
  
  // If no table found in the text, as a fallback, try to generate synthetic student data
  const synthData = generateSyntheticStudentData(lines);
  if (synthData) return synthData;
  
  // No valid table found
  return null;
};

/**
 * Generate synthetic student data for visualization when clean table extraction fails
 * @param {string[]} lines - Lines that appear to contain student data
 * @returns {Array} - Synthetic student data for visualization
 */
const generateSyntheticStudentData = (lines) => {
  const result = [];
  
  // Create a simple 2-column dataset with Student and Score
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Try to extract a name and a number
    const nameMatch = line.match(/([A-Za-z]+\s+[A-Za-z]+)/);
    const numberMatch = line.match(/\b(\d{2,3})\b/); // Look for 2-3 digit numbers (likely scores)
    
    if (nameMatch && numberMatch) {
      result.push({
        'Student': nameMatch[1],
        'Score': parseInt(numberMatch[1], 10)
      });
    }
  }
  
  return result.length > 0 ? result : null;
};

/**
 * Parse a row of data based on common table formats
 * @param {string} row - The row text
 * @returns {string[]} - Array of cell values
 */
const parseRowData = (row) => {
  // Remove leading/trailing pipe characters if present
  const trimmedRow = row.trim().replace(/^\||\|$/g, '');
  
  // If the row has pipe separators, split by pipes
  if (trimmedRow.includes('|')) {
    return trimmedRow.split('|').map(cell => cell.trim());
  }
  
  // If no pipes, try to split by consistent whitespace
  return trimmedRow.split(/\s{2,}/).map(cell => cell.trim()).filter(cell => cell);
};

/**
 * Find consistent spaces in a line that might indicate column separations
 * @param {string} line - The line to analyze
 * @returns {number[]} - Array of positions where there are spaces
 */
const findConsistentSpaces = (line) => {
  const spaces = [];
  let inSpaceRegion = false;
  
  for (let i = 0; i < line.length; i++) {
    if (line[i] === ' ') {
      if (!inSpaceRegion) {
        inSpaceRegion = true;
        spaces.push(i);
      }
    } else {
      inSpaceRegion = false;
    }
  }
  
  return spaces;
};

/**
 * Check if two arrays are similar enough
 * @param {Array} arr1 - First array
 * @param {Array} arr2 - Second array
 * @returns {boolean} - True if arrays match
 */
const arraysMatch = (arr1, arr2) => {
  if (!arr1 || !arr2 || arr1.length < 2 || arr2.length < 2) return false;
  
  // We don't need exact match, just enough to suggest consistent columns
  const tolerance = Math.max(1, Math.floor(arr1.length * 0.25));
  let matches = 0;
  
  for (const pos1 of arr1) {
    for (const pos2 of arr2) {
      if (Math.abs(pos1 - pos2) <= 3) {
        matches++;
        break;
      }
    }
  }
  
  return matches >= Math.min(arr1.length, arr2.length) - tolerance;
}; 