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
  IconButton
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title, 
  Tooltip, 
  Legend
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

// Register ChartJS components
ChartJS.register(
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title, 
  Tooltip, 
  Legend
);

const SimpleBarChart = ({ open, onClose, data }) => {
  const [chartData, setChartData] = useState(null);
  
  // Process data for visualization
  useEffect(() => {
    if (!data || !Array.isArray(data) || data.length === 0) {
      setChartData(null);
      return;
    }
    
    // Get all columns from the data
    const headers = Object.keys(data[0]);
    if (headers.length === 0) {
      setChartData(null);
      return;
    }
    
    // For student data, look for specific columns
    let nameColumn = headers.find(h => h === 'Name') || 
                     headers.find(h => /name/i.test(h)) || 
                     headers[0];
    
    // Look for score columns - prefer MathScore, EnglishScore, ScienceScore
    let scoreColumn = headers.find(h => h === 'MathScore') || 
                      headers.find(h => /score/i.test(h)) || 
                      headers.find(col => {
                        // Find first numeric column that's not StudentID
                        return col !== 'StudentID' && 
                               typeof data[0][col] === 'number' || 
                               !isNaN(Number(data[0][col]));
                      }) || 
                      headers[1];
    
    // Extract the data
    const labels = data.map(row => String(row[nameColumn] || ''));
    const values = data.map(row => {
      const val = row[scoreColumn];
      return typeof val === 'number' ? val : Number(val) || 0;
    });
    
    // Set chart data
    setChartData({
      labels,
      values,
      headers,
      rawData: data,
      labelColumn: nameColumn,
      valueColumn: scoreColumn
    });
  }, [data]);

  // Chart options
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: true,
        text: chartData?.valueColumn ? `Student ${chartData.valueColumn} Visualization` : 'SQL Data Visualization',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: chartData?.valueColumn || 'Value',
          font: {
            weight: 'bold'
          }
        }
      },
      x: {
        title: {
          display: true,
          text: chartData?.labelColumn || 'Student',
          font: {
            weight: 'bold'
          }
        },
        ticks: {
          maxRotation: 0, // Keep labels horizontal
          minRotation: 0,
          autoSkip: true,
          maxTicksLimit: 10
        }
      }
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      aria-labelledby="bar-chart-dialog-title"
    >
      <DialogTitle id="bar-chart-dialog-title">
        SQL Data Visualization
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
        {/* Bar Chart */}
        <Box sx={{ height: 400, mb: 3 }}>
          {chartData ? (
            <Bar 
              data={{
                labels: chartData.labels,
                datasets: [
                  {
                    label: chartData.valueColumn,
                    data: chartData.values,
                    backgroundColor: 'rgba(75, 192, 192, 0.7)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 1,
                    borderRadius: 4,
                    barPercentage: 0.8,
                    categoryPercentage: 0.8
                  },
                ],
              }} 
              options={chartOptions}
            />
          ) : (
            <Typography align="center">No data available for visualization</Typography>
          )}
        </Box>

        {/* Data Table */}
        {chartData && chartData.rawData && (
          <Box>
            <Typography variant="subtitle2" gutterBottom>Data Table:</Typography>
            <Paper variant="outlined" sx={{ maxHeight: 200, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {chartData.headers.map((header, index) => (
                      <th key={index} style={{ padding: '8px', borderBottom: '1px solid #ddd', textAlign: 'left' }}>
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {chartData.rawData.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {chartData.headers.map((header, colIndex) => (
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

export default SimpleBarChart; 