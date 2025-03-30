import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions, 
  Button, 
  Typography,
  Paper,
  Divider,
  Chip,
  IconButton
} from '@mui/material';
import { 
  BarChart, 
  PieChart, 
  ShowChart,
  Close as CloseIcon
} from '@mui/icons-material';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title, 
  Tooltip, 
  Legend, 
  ArcElement,
  PointElement,
  LineElement
} from 'chart.js';
import { Bar, Pie, Line } from 'react-chartjs-2';
import { parseTableData, analyzeQuery } from '../utils/sqlParser';

// Register ChartJS components
ChartJS.register(
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title, 
  Tooltip, 
  Legend, 
  ArcElement,
  PointElement,
  LineElement
);

const SQLVisualization = ({ open, onClose, data, sqlQuery }) => {
  const [chartType, setChartType] = useState('bar');
  const [processedData, setProcessedData] = useState(null);
  const [queryInfo, setQueryInfo] = useState(null);
  
  // When the query changes, analyze it
  useEffect(() => {
    if (sqlQuery) {
      const info = analyzeQuery(sqlQuery);
      setQueryInfo(info);
      
      // Check if we're dealing with student data that's not a count query
      const hasStudentData = sqlQuery.toLowerCase().includes('student') || 
                            sqlQuery.toLowerCase().includes('name') || 
                            sqlQuery.toLowerCase().includes('score') ||
                            sqlQuery.toLowerCase().includes('mark');
      
      // For student data without COUNT, use bar chart by default
      if (hasStudentData && !sqlQuery.toLowerCase().includes('count')) {
        setChartType('bar');
      }
      // If it's a count query, default to pie chart
      else if (sqlQuery.toLowerCase().includes('count')) {
        setChartType('pie');
      }
      // If it's a score-related query, default to pie chart for comparisons
      else if (info && info.filterField && /score|grade|mark/i.test(info.filterField)) {
        setChartType('pie');
      }
    }
  }, [sqlQuery]);
  
  // Process data when available - simplified approach
  useEffect(() => {
    if (!data || !Array.isArray(data) || data.length === 0) {
      setProcessedData(null);
      return;
    }
    
    // Get the first two columns from the data
    const headers = Object.keys(data[0]);
    if (headers.length === 0) {
      setProcessedData(null);
      return;
    }
    
    // Simply use the first column for labels, second for values (or first if only one column)
    const labelColumn = headers[0];
    const valueColumn = headers.length > 1 ? headers[1] : headers[0];
    
    // Extract the data
    const labels = data.map(row => String(row[labelColumn] || ''));
    const values = data.map(row => {
      const val = row[valueColumn];
      return typeof val === 'number' ? val : Number(val) || 0;
    });
    
    // Set processed data
    setProcessedData({
      labels,
      values,
      backgroundColors: Array(labels.length).fill('rgba(54, 162, 235, 0.6)'),
      barChartColors: Array(labels.length).fill('rgba(54, 162, 235, 0.6)'),
      labelColumn,
      valueColumn,
      headers,
      rawData: data
    });
    
    // Default to bar chart
    setChartType('bar');
  }, [data]);

  // Prepare chart data based on the current chart type
  const getChartData = () => {
    if (!processedData) return null;
    
    // If this is a count query and we're showing a pie chart
    if (chartType === 'pie' && sqlQuery && sqlQuery.toLowerCase().includes('count')) {
      // If we have comparison data, use it
      if (processedData.comparisonData) {
        return {
          labels: processedData.comparisonData.labels,
          datasets: [
            {
              label: processedData.comparisonData.description,
              data: processedData.comparisonData.values,
              backgroundColor: ['rgba(75, 192, 192, 0.6)', 'rgba(255, 99, 132, 0.6)'],
              borderColor: ['rgba(75, 192, 192, 1)', 'rgba(255, 99, 132, 1)'],
              borderWidth: 1,
            },
          ],
        };
      }
      
      // Otherwise, if we have a single numeric result (from a COUNT query)
      if (processedData.rawData.length === 1) {
        const countResult = Number(Object.values(processedData.rawData[0])[0]);
        
        // Extract information from query (e.g., "score > 80" => 80)
        let threshold = 0;
        let operator = '>';
        const thresholdMatch = sqlQuery.match(/([><=!]+)\s*(\d+)/);
        if (thresholdMatch) {
          operator = thresholdMatch[1];
          threshold = parseInt(thresholdMatch[2], 10);
        }
        
        // Try to identify which column we're filtering on
        let filterColumn = "score";
        const scoreMatch = sqlQuery.match(/([a-z0-9_]+(?:score|grade|mark|point)[a-z0-9_]*)/i);
        if (scoreMatch) {
          filterColumn = scoreMatch[1];
        }
        
        // Default estimate of total students is 80 (can be changed based on your data)
        const totalEstimate = 80;
        
        // Use the actual count provided by the query
        const notMatchingCount = totalEstimate - countResult;
        
        // Create labels based on the query
        let matchingLabel = "Matching";
        if (operator === '>') matchingLabel = `${filterColumn} > ${threshold}`;
        else if (operator === '<') matchingLabel = `${filterColumn} < ${threshold}`;
        else if (operator === '>=') matchingLabel = `${filterColumn} ≥ ${threshold}`;
        else if (operator === '<=') matchingLabel = `${filterColumn} ≤ ${threshold}`;
        else if (operator === '=') matchingLabel = `${filterColumn} = ${threshold}`;
        
        return {
          labels: [`${matchingLabel} (${countResult})`, `Not Matching (${notMatchingCount})`],
          datasets: [
            {
              label: 'SQL Query Results',
              data: [countResult, notMatchingCount],
              backgroundColor: ['rgba(75, 192, 192, 0.6)', 'rgba(255, 99, 132, 0.6)'],
              borderColor: ['rgba(75, 192, 192, 1)', 'rgba(255, 99, 132, 1)'],
              borderWidth: 1,
            },
          ],
        };
      }
    }
    
    // For bar charts with student data
    if (chartType === 'bar') {
      // Look for student data columns
      let nameColumn = processedData.labelColumn;
      let scoreColumn = processedData.valueColumn;
      
      // Try to find a name-like column and a score-like column
      const headers = processedData.headers;
      for (const header of headers) {
        const lowerHeader = header.toLowerCase();
        if (lowerHeader.includes('name') || lowerHeader.includes('student')) {
          nameColumn = header;
        } else if (lowerHeader.includes('score') || lowerHeader.includes('mark') || 
                   lowerHeader.includes('grade') || lowerHeader.includes('point')) {
          scoreColumn = header;
        }
      }
      
      // Get student names and scores
      const names = processedData.rawData.map(row => String(row[nameColumn] || ''));
      const scores = processedData.rawData.map(row => {
        const val = row[scoreColumn];
        return typeof val === 'number' ? val : Number(val) || 0;
      });
      
      // Create a better bar chart config for student data
      return {
        labels: names,
        datasets: [
          {
            label: `${scoreColumn}`,
            data: scores,
            backgroundColor: 'rgba(54, 162, 235, 0.6)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1,
            barPercentage: 0.6,
            categoryPercentage: 0.8
          },
        ],
      };
    }
    
    // For other charts, use the regular data
    const { labels, values, backgroundColors, labelColumn, valueColumn } = processedData;
    
    return {
      labels,
      datasets: [
        {
          label: `${valueColumn} by ${labelColumn}`,
          data: values,
          backgroundColor: backgroundColors,
          borderColor: backgroundColors.map(color => color.replace('0.6', '1')),
          borderWidth: 1,
        },
      ],
    };
  };

  // Update chart options for better readability
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: true,
        text: 'SQL Data Visualization',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Value',
        }
      },
      x: {
        title: {
          display: true,
          text: 'Category',
        },
        ticks: {
          maxRotation: 0,
          minRotation: 0,
          autoSkip: true,
          maxTicksLimit: 10
        }
      }
    }
  };

  // Function to determine the best chart type based on data
  const suggestChartType = () => {
    if (!processedData) return 'bar';
    
    const { labels, rawData } = processedData;
    
    // If <= 6 categories, pie chart might be good
    if (labels.length <= 6) {
      return 'pie';
    }
    
    // If data looks like a time series (date-like labels), line chart
    const hasDateLabels = labels.some(label => 
      /^\d{4}-\d{2}-\d{2}|^\d{2}\/\d{2}\/\d{4}|^\d{2}-\d{2}-\d{4}/.test(label)
    );
    
    if (hasDateLabels) {
      return 'line';
    }
    
    // Default to bar chart
    return 'bar';
  };

  // Update chart type when data changes
  useEffect(() => {
    if (processedData) {
      setChartType(suggestChartType());
    }
  }, [processedData]);

  // Render the appropriate chart based on type
  const renderChart = () => {
    const chartData = getChartData();
    if (!chartData) return <Typography>No data available for visualization</Typography>;
    
    switch (chartType) {
      case 'bar':
        return (
          <Box sx={{ height: 400 }}>
            <Bar data={chartData} options={chartOptions} />
          </Box>
        );
      case 'pie':
        return (
          <Box sx={{ height: 400 }}>
            <Pie data={chartData} options={chartOptions} />
          </Box>
        );
      case 'line':
        return (
          <Box sx={{ height: 400 }}>
            <Line data={chartData} options={chartOptions} />
          </Box>
        );
      default:
        return (
          <Box sx={{ height: 400 }}>
            <Bar data={chartData} options={chartOptions} />
          </Box>
        );
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      aria-labelledby="sql-visualization-dialog-title"
    >
      <DialogTitle id="sql-visualization-dialog-title">
        SQL Visualization
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{
            position: 'absolute',
            right: 8,
            top: 8,
            color: (theme) => theme.palette.grey[500],
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {/* SQL Query Display */}
        {sqlQuery && (
          <Box mb={2}>
            <Typography variant="subtitle2" gutterBottom>SQL Query:</Typography>
            <Paper variant="outlined" sx={{ p: 2, backgroundColor: '#f5f5f5' }}>
              <pre style={{ margin: 0, overflow: 'auto' }}>{sqlQuery}</pre>
            </Paper>
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Chart Type Selection */}
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
          <Typography variant="subtitle2" sx={{ mr: 2, alignSelf: 'center' }}>
            Chart Type:
          </Typography>
          <Chip 
            icon={<BarChart />} 
            label="Bar Chart" 
            onClick={() => setChartType('bar')} 
            color={chartType === 'bar' ? 'primary' : 'default'}
            sx={{ mr: 1 }}
          />
          <Chip 
            icon={<PieChart />} 
            label="Pie Chart" 
            onClick={() => setChartType('pie')} 
            color={chartType === 'pie' ? 'primary' : 'default'}
            sx={{ mr: 1 }}
          />
          <Chip 
            icon={<ShowChart />} 
            label="Line Chart" 
            onClick={() => setChartType('line')} 
            color={chartType === 'line' ? 'primary' : 'default'}
          />
        </Box>

        {/* Chart Display */}
        {renderChart()}

        {/* Data Table (simplified) */}
        {processedData && processedData.rawData && (
          <Box mt={3}>
            <Typography variant="subtitle2" gutterBottom>Data Table:</Typography>
            <Paper variant="outlined" sx={{ maxHeight: 200, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {processedData.headers.map((header, index) => (
                      <th key={index} style={{ padding: '8px', borderBottom: '1px solid #ddd', textAlign: 'left' }}>
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {processedData.rawData.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {processedData.headers.map((header, colIndex) => (
                        <td key={colIndex} style={{ padding: '8px', borderBottom: '1px solid #ddd' }}>
                          {row[header]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Paper>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="primary">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SQLVisualization; 
