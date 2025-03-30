import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Box, 
  TextField, 
  IconButton, 
  Paper,
  CircularProgress,
  Snackbar,
  Alert,
  Tooltip,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Typography
} from '@mui/material';
import { Send, ScreenshotMonitor, Pause, SmartToy, ContentCopy, DeleteSweep, Event, BarChart, Email } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import Tesseract from 'tesseract.js';
import calendarService from '../utils/calendarService';
import SimpleBarChart from './SimpleBarChart';
import { extractSQLQuery, parseTableData } from '../utils/sqlParser';

// The actual Electron imports - only available when running in Electron
const electron = window.require ? window.require('electron') : null;
const ipcRenderer = electron ? electron.ipcRenderer : null;

function ChatInterface() {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');
  const [errorSnack, setErrorSnack] = useState({ open: false, message: '' });
  const [capturedText, setCapturedText] = useState('');
  const [suggestedQueries, setSuggestedQueries] = useState([]);
  const [infoSnack, setInfoSnack] = useState({ open: false, message: '' });
  const [typingInterval, setTypingInterval] = useState(null);
  const [captureDialogOpen, setCaptureDialogOpen] = useState(false);
  const [captureCountdown, setCaptureCountdown] = useState(3);
  const [emailData, setEmailData] = useState(null);
  const [copiedSnack, setCopiedSnack] = useState({ open: false, message: '' });
  const messagesEndRef = useRef(null);
  const countdownRef = useRef(null);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const navigate = useNavigate();
  // Add a flag to prevent duplicate email analysis
  const [emailAnalysisInProgress, setEmailAnalysisInProgress] = useState(false);
  
  // Calendar state
  const [isCalendarAvailable, setIsCalendarAvailable] = useState(false);
  
  // SQL Visualization states
  const [sqlVisualizationOpen, setSqlVisualizationOpen] = useState(false);
  const [sqlData, setSqlData] = useState(null);
  const [sqlQuery, setSqlQuery] = useState('');
  const [hasSQL, setHasSQL] = useState(false);

  // Add state for meeting detection
  const [isMeetingRelated, setIsMeetingRelated] = useState(false);
  const [meetingDetails, setMeetingDetails] = useState(null);
  const [showMeetingConfirmation, setShowMeetingConfirmation] = useState(false);
  
  // Function to detect if content is meeting-related and extract details
  const detectMeetingContent = (text) => {
    if (!text) return { isMeetingRelated: false, details: null };
    
    // Check if it contains meeting-related keywords
    const meetingPattern = /meeting|schedule|appointment|call|discuss|zoom|teams|google meet|conference/i;
    const datePattern = /(\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(?:\w*)|\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}|tomorrow|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i;
    const timePattern = /(\d{1,2}(?::\d{2})?\s*(?:am|pm)|noon|midnight|\d{1,2}\s*o'?clock)/i;
    
    const hasMeetingWords = meetingPattern.test(text);
    const hasDateWords = datePattern.test(text);
    const hasTimeWords = timePattern.test(text);
    
    // Only consider it a meeting if it has meeting words AND either date or time information
    if (hasMeetingWords && (hasDateWords || hasTimeWords)) {
      // Try to extract potential date and time
      const dateMatch = text.match(datePattern);
      const timeMatch = text.match(timePattern);
      
      const details = {
        date: dateMatch ? dateMatch[0] : null,
        time: timeMatch ? timeMatch[0] : null,
        rawText: text
      };
      
      return { isMeetingRelated: true, details };
    }
    
    return { isMeetingRelated: false, details: null };
  };

  // Add localStorage persistence for messages
  useEffect(() => {
    // Check if calendar service is authenticated
    const checkCalendarAuth = async () => {
      const isAuthenticated = calendarService.isAuthenticated();
      setIsCalendarAvailable(isAuthenticated);
      
      // Get stored messages from localStorage
      const storedMessages = localStorage.getItem('chat_messages');
      const parsedMessages = storedMessages ? JSON.parse(storedMessages) : [];
      
      // Set initial messages if no stored messages exist
      if (parsedMessages.length === 0) {
        const initialMessages = [
          { 
            text: "👋 Welcome! I'm your AI assistant. I can help you with various tasks like solving SQL queries and scheduling meetings.", 
            sender: 'ai' 
          }
        ];
        setMessages(initialMessages);
        localStorage.setItem('chat_messages', JSON.stringify(initialMessages));
        
        // Set initial suggested queries
        setSuggestedQueries([
          "Connect to Google Calendar",
          "Schedule a meeting with Jane tomorrow at 3pm",
          "Capture my screen",
          "What can you help me with?"
        ]);
      } else {
        setMessages(parsedMessages);
      }
    };
    
    // Check initially
    checkCalendarAuth();
    
    // Set up interval to check periodically (every 5 minutes)
    const intervalId = setInterval(checkCalendarAuth, 5 * 60 * 1000);
    
    // Clean up the interval when component unmounts
    return () => clearInterval(intervalId);
  }, []); // Remove messages.length dependency

  // Update localStorage whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('chat_messages', JSON.stringify(messages));
    }
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentResponse]);

  // Cleanup effect to clear interval if component unmounts
  useEffect(() => {
    return () => {
      if (typingInterval) {
        clearInterval(typingInterval);
      }
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, [typingInterval]);

  const typewriterEffect = (text, speed = 30) => {
    let currentIndex = 0;
    setCurrentResponse('');
    
    // Clear any existing interval
    if (typingInterval) {
      clearInterval(typingInterval);
    }
    
    const interval = setInterval(() => {
      if (currentIndex < text.length) {
        setCurrentResponse(prev => prev + text[currentIndex]);
        currentIndex++;
      } else {
        clearInterval(interval);
        setTypingInterval(null);
        setIsLoading(false);
      }
    }, speed);
    
    // Store interval reference for pausing
    setTypingInterval(interval);
  };

  // Function to pause the typewriter effect
  const pauseTypewriter = () => {
    if (typingInterval) {
      clearInterval(typingInterval);
      setTypingInterval(null);
      // Finish displaying the content immediately
      setMessages(prev => [...prev, { text: currentResponse, sender: 'ai' }]);
      setCurrentResponse('');
      setIsLoading(false);
    }
  };

  // Enhanced text cleanup with improved email detection
  const cleanupCapturedText = (text) => {
    if (!text) return "";
    
    // Try to identify if this is an email by looking for common email patterns
    const isEmail = /inbox|compose|subject|to:|from:|cc:|bcc:|sent|draft|gmail|outlook|mail|would like to schedule|meeting|collaboration|availability/i.test(text);
    
    // For emails, try to extract structured data
    if (isEmail) {
      try {
        // Look for common email fields
        const fromMatch = text.match(/(?:From|Sender):\s*([^\n]+)/i);
        const toMatch = text.match(/To:\s*([^\n]+)/i);
        const subjectMatch = text.match(/Subject:\s*([^\n]+)/i);
        // Improve the date match pattern to catch more date formats
        const dateMatch = text.match(/Date:\s*([^\n]+)/i) || 
                          text.match(/(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})/i) ||
                          text.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
        
        // Try to extract email body by finding text after common header patterns
        let body = text;
        const headerPatterns = [/^.*Subject:.*$/m, /^.*Date:.*$/m, /^.*To:.*$/m, /^.*From:.*$/m];
        for (const pattern of headerPatterns) {
          const match = text.match(pattern);
          if (match && match.index !== undefined) {
            const possibleBody = text.substring(match.index + match[0].length).trim();
            if (possibleBody.length < body.length) {
              body = possibleBody;
            }
          }
        }
        
        // Create structured email data
        const emailData = {
          from: fromMatch ? fromMatch[1].trim() : 'Unknown sender',
          to: toMatch ? toMatch[1].trim() : 'Unknown recipient',
          subject: subjectMatch ? subjectMatch[1].trim() : 'No subject',
          date: dateMatch ? dateMatch[1].trim() : 'Unknown date',
          body: body.trim()
        };
        
        // Store the structured email data
        setEmailData(emailData);
        
        // Return the original text but with better structure
        return `EMAIL CONTENT:
From: ${emailData.from}
To: ${emailData.to}
Subject: ${emailData.subject}
Date: ${emailData.date}

${emailData.body}`;
      } catch (error) {
        console.error("Error parsing email content:", error);
        // If parsing fails, still treat it as an email but with minimal structure
        setEmailData({
          from: 'Unknown sender',
          to: 'Unknown recipient',
          subject: 'No subject',
          date: 'Unknown date',
          body: text.trim()
        });
        
        return `EMAIL CONTENT:
${text.trim()}`;
      }
    }
    
    // For non-emails, apply standard cleanup
    const lines = text.split('\n').filter(line => line.trim().length > 5);
    
    const filteredLines = lines.filter(line => {
      const specialCharRatio = (line.match(/[^a-zA-Z0-9\s.,]/g) || []).length / line.length;
      return specialCharRatio < 0.3;
    });
    
    return filteredLines.join('\n');
  };

  // Add improved pattern matching for scheduling intent
  const hasSchedulingIntent = (message) => {
    const schedulingPatterns = [
      /schedule (a|an) (meeting|appointment|event|call)/i,
      /set up (a|an) (meeting|appointment|event|call)/i,
      /create (a|an) (meeting|appointment|event|call)/i,
      /add (a|an) (meeting|appointment|event|call)/i,
      /book (a|an) (appointment|meeting|event|call)/i,
      /plan (a|an) (meeting|appointment|event|call)/i,
      /calendar/i
    ];
    
    return schedulingPatterns.some(pattern => pattern.test(message));
  };

  // Update the sendToGroq function to handle message array
  const sendToGroq = async (msgs) => {
    try {
      setIsLoading(true);
      
      const apiKey = process.env.REACT_APP_GROQ_API_KEY;
      if (!apiKey) {
        throw new Error('Groq API key is not configured. Please check your environment variables.');
      }
      
      // Create messages array, including captured text if available
      const messagesForAPI = [
        {
          role: 'system',
          content: `You are a helpful AI assistant. Provide clear and concise responses. If the user wants to schedule an event or meeting, recognize this intent and tell them to rephrase with specific date, time, and title details.`
        }
      ];
      
      // Add captured text context if available
      if (capturedText) {
        if (emailData) {
          messagesForAPI.push({
            role: 'system',
            content: `The user previously captured an email from their screen. Here are the details:
From: ${emailData.from}
To: ${emailData.to}
Subject: ${emailData.subject}
Date: ${emailData.date}
Body: ${emailData.body}

For drafting a reply, analyzing the email, or anything related to this email content, use the above information.`
          });
        } else {
          messagesForAPI.push({
            role: 'system',
            content: `The user previously captured the following text from their screen. If they ask about "captured text", "screenshot", or anything related to the screen content, use this information: ${capturedText}`
          });
        }
      }

      // Add information about calendar availability
      if (isCalendarAvailable) {
        messagesForAPI.push({
          role: 'system', 
          content: `The user has connected their Google Calendar. If they ask about scheduling events or meetings, you can help them create events by acknowledging their request and asking for specific details if needed.`
        });
      }
      
      // Add all previous messages
      for (const msg of msgs) {
        messagesForAPI.push({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.text
        });
      }
      
      // Fetch from the Groq API with proper error handling
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: messagesForAPI,
          temperature: 0.7,
          max_tokens: 1024
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `API request failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.choices && data.choices.length > 0) {
        const aiResponse = data.choices[0].message.content;
        
        // Use the typewriter effect
        typewriterEffect(aiResponse);
        
        // Add the message after typewriter effect completes
        setTimeout(() => {
          setMessages(prev => [...prev, { text: aiResponse, sender: 'ai' }]);
          setCurrentResponse('');
          
          // Generate suggested queries based on the AI response
          generateSuggestedQueries(aiResponse);
        }, aiResponse.length * 30 + 100);
      } else {
        throw new Error('No response from AI');
      }
    } catch (error) {
      console.error("Error sending message to API:", error);
      
      // Show error message with typewriter effect
      const errorMessage = `I'm sorry, but I encountered an error: ${error.message}`;
      typewriterEffect(errorMessage);
      
      // Add error message after typewriter effect completes
      setTimeout(() => {
        setMessages(prev => [...prev, { text: errorMessage, sender: 'ai' }]);
        setCurrentResponse('');
      }, errorMessage.length * 30 + 100);
    } finally {
      setIsLoading(false);
    }
  };

  // Revert the handleCreateCalendarEvent function to original implementation
  const handleCreateCalendarEvent = async (eventDetails) => {
    if (!isCalendarAvailable) {
      setMessages(prev => [...prev, {
        text: "I'd like to help you schedule that, but you need to connect to Google Calendar first. Would you like to connect now?",
        sender: 'ai'
      }]);
      
      // Show authenticate option
      setSuggestedQueries(["Yes, connect to Google Calendar"]);
      setIsLoading(false);
      return;
    }
    
    try {
      // Calculate end time based on duration (default to 30 minutes)
      const duration = eventDetails.duration || 30;
      const startDateTime = new Date(`${eventDetails.startDate}T${eventDetails.startTime}`);
      const endDateTime = new Date(startDateTime.getTime() + duration * 60000);
      
      // Create the event in Google Calendar
      const eventData = calendarService.formatEvent(
        eventDetails.title,
        eventDetails.description || '',
        startDateTime,
        endDateTime,
        eventDetails.attendees || []
      );
      
      await calendarService.createEvent('primary', eventData);
      
      // Create success message
      const successMessage = `I've scheduled "${eventDetails.title}" for ${startDateTime.toLocaleString()} (duration: ${duration} minutes)`;
      typewriterEffect(successMessage);
      
      // Add AI message after typewriter effect completes
      setTimeout(() => {
        setMessages(prev => [...prev, { text: successMessage, sender: 'ai' }]);
        setCurrentResponse('');
      }, successMessage.length * 30 + 100);
      
    } catch (error) {
      console.error("Error creating calendar event:", error);
      setMessages(prev => [...prev, {
        text: `Sorry, I couldn't create the event. Error: ${error.message || 'Unknown error'}. Please try again or check your calendar permissions.`,
        sender: 'ai'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const generateSuggestedQueries = async (text, isEmail = false) => {
    try {
      // Get suggested queries based on the captured content
      const systemPrompt = isEmail 
        ? 'Generate 3-4 practical questions about this email. Focus on actions like replying, summarizing, or analyzing its content. Return only the questions, one per line.'
        : 'Generate 3-4 short, specific questions about the captured content. Focus on practical actions. Return only the questions, one per line.';
        
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.REACT_APP_GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: `I've captured this content from my screen. What questions might I want to ask about it?\n\n${text}`
            }
          ],
          temperature: 0.7,
          max_tokens: 256
        })
      });

      if (!response.ok) throw new Error("Failed to generate suggested queries");
      
      const data = await response.json();
      const suggestions = data.choices[0]?.message?.content.split('\n').filter(q => q.trim());
      
      return suggestions || [];
    } catch (error) {
      console.error("Error generating suggested queries:", error);
      return [];
    }
  };

  const startScreenCapture = () => {
    // Show the capture dialog
    setCaptureDialogOpen(true);
    
    // Start the countdown
    setCaptureCountdown(3);
    
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }
    
    countdownRef.current = setInterval(() => {
      setCaptureCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          setCaptureDialogOpen(false);
          // Actually perform the capture
          performScreenCapture();
          return 0;
        }
        return prev - 1;
      });
      }, 1000);
  };
  
  const cancelScreenCapture = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }
    setCaptureDialogOpen(false);
  };

  const performScreenCapture = async () => {
    if (!ipcRenderer) {
        setErrorSnack({ 
            open: true, 
            message: "Screen capture is only available in the Electron app."
        });
        return;
    }

    setIsCapturing(true);
    setSuggestedQueries([]);
    setEmailData(null);
    setHasSQL(false); // Reset SQL detection
    
    try {
        // Capture the screen
        const result = await ipcRenderer.invoke('capture-screen');
        
        if (!result) {
            throw new Error("Failed to capture screen");
        }
        
        // Get the image data
        const imageData = result.thumbnail;
        
        // Recognize text from the screen capture using updated Tesseract API
        const { data } = await Tesseract.recognize(imageData, 'eng');
        
        // If text was detected, clean it up
        if (data.text && data.text.trim()) {
            const rawText = data.text.trim();
            const cleanedText = cleanupCapturedText(rawText);
            
            // Store the cleaned text for future reference
            setCapturedText(cleanedText);

            // Check for SQL query and table data in the captured text
            const sqlQuery = extractSQLQuery(cleanedText);
            const tableData = parseTableData(cleanedText);
            
            // Determine if we have valid table data
            const hasValidTableData = tableData && tableData.length > 0;
            
            // Check for SQL-like content
            const hasSqlKeywords = /SELECT|FROM|WHERE|JOIN|GROUP BY|ORDER BY|INSERT|UPDATE|DELETE/i.test(cleanedText);
            const hasTableKeywords = /table|database|sql|rows?|records?|results?|id|name|score|data|values?/i.test(cleanedText);
            
            // More lenient SQL detection - any of these conditions can trigger visualization
            if (sqlQuery || 
                (hasValidTableData && tableData.length >= 2) || 
                (hasValidTableData && (hasSqlKeywords || hasTableKeywords))) {
                
                console.log("SQL/Table content detected:", { 
                    sqlQuery, 
                    tableDataLength: tableData ? tableData.length : 0,
                    hasValidTableData,
                    hasSqlKeywords,
                    hasTableKeywords
                });
                
                // Always set SQL data when we have table data, even without SQL query
                if (tableData) {
                    setSqlData(tableData);
                    setHasSQL(true);
                }
                
                if (sqlQuery) {
                    setSqlQuery(sqlQuery);
                    setHasSQL(true);
                }
                
                // If either condition was met, show notification
                if (hasValidTableData || sqlQuery) {
                    setInfoSnack({
                        open: true,
                        message: "Table data detected! Click the 'Visualize Data' button to see charts."
                    });
                }
            } else {
                console.log("No SQL/Table content detected in capture");
                setHasSQL(false);
            }

            // Determine if this is an email or meeting-related content
            const hasEmailWords = /would like to schedule|meeting|collaboration|availability|email|message/i.test(cleanedText);
            const isEmail = emailData !== null || hasEmailWords;
            
            // Check if the content is related to scheduling a meeting
            const { isMeetingRelated, details } = detectMeetingContent(cleanedText);
            if (isMeetingRelated) {
                console.log("Meeting-related content detected:", details);
                setIsMeetingRelated(true);
                setMeetingDetails(details);
                setShowMeetingConfirmation(true);
                
                // Show a notification that meeting content was detected
                setInfoSnack({
                    open: true,
                    message: "Meeting request detected! You can confirm or reschedule."
                });
            } else {
                setIsMeetingRelated(false);
                setMeetingDetails(null);
            }
            
            // Generate suggested queries based on the content
            const suggestions = await generateSuggestedQueries(cleanedText, isEmail);
            setSuggestedQueries(suggestions);

            // For non-email, non-SQL captures, directly add the content to the chat context
            if (!isEmail && !hasValidTableData && !sqlQuery) {
                setInfoSnack({
                    open: true,
                    message: "Screen content captured! You can now ask questions about it."
                });
            }
        } else {
            // No text was detected
            setInfoSnack({
                open: true,
                message: "No text detected on screen. Try capturing a different area."
            });
        }
    } catch (error) {
        console.error('Screen capture error:', error);
        setErrorSnack({ 
            open: true, 
            message: "Error capturing screen content: " + error.message
        });
    } finally {
        setIsCapturing(false);
    }
};

  const handleSuggestedQuery = (query) => {
    // Add the query as a user message
    setMessages(prev => [...prev, { text: query, sender: 'user' }]);
    
    // Handle special queries that need custom responses
    if (query === "Yes, connect to Google Calendar") {
      // Add a transitional message
      setMessages(prev => [...prev, { 
        text: "Great! I'll redirect you to Google's authentication page. After connecting, you'll be able to schedule events directly from our chat.", 
        sender: 'ai' 
      }]);
      
      // Navigate to Google auth page after a short delay
      setTimeout(() => {
        navigate('/calendar-auth');
      }, 1500);
      return;
    }
    
    // Send the query directly to the API without requiring the send button
    sendToGroq([...messages, { text: query, sender: 'user' }]);
  };

  const handleCalendarClick = () => {
    if (isCalendarAvailable) {
      // Show message before navigating
      setMessages(prev => [...prev, { 
        text: "Opening your Google Calendar view. You can manage all your events there and return to chat when you're done.", 
        sender: 'ai' 
      }]);
      setTimeout(() => navigate('/calendar'), 1500);
    } else {
      // Add message about connecting
      setMessages(prev => [...prev, { 
        text: "You'll need to connect your Google Calendar to enable scheduling features. I'll redirect you to the authentication page.", 
        sender: 'ai' 
      }]);
      setTimeout(() => navigate('/calendar-auth'), 1500);
    }
  };


  // Function to close the Success/Info snackbar
  const handleCloseInfoSnack = () => {
    setInfoSnack({ open: false, message: '' });
  };

  // Function to close the Error snackbar
  const handleCloseErrorSnack = () => {
    setErrorSnack({ open: false, message: '' });
  };

  // Function to close the Copied snackbar
  const handleCloseCopiedSnack = () => {
    setCopiedSnack({ open: false, message: '' });
  };

  // Helper function to format code blocks with copy button (simplified version)
  const formatMessageWithCodeBlocks = (text) => {
    if (!text) return '';

    // Regular expression to match code blocks (text between triple backticks)
    const codeBlockRegex = /```(?:(\w+)\n)?([\s\S]*?)```/g;
    
    // Split the text by code blocks
    const parts = [];
    let lastIndex = 0;
    let match;
    
    while ((match = codeBlockRegex.exec(text)) !== null) {
      // Add the text before the code block
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          content: text.substring(lastIndex, match.index)
        });
      }
      
      // Add the code block (simplified, no syntax highlighting)
      const language = match[1] || 'plaintext'; // Default to plaintext if no language is specified
      const code = match[2].trim();
      
      parts.push({
        type: 'code',
        language,
        content: code
      });
      
      lastIndex = match.index + match[0].length;
    }
    
    // Add the remaining text after the last code block
    if (lastIndex < text.length) {
      parts.push({
        type: 'text',
        content: text.substring(lastIndex)
      });
    }
    
    return parts;
  };

  const handleCopyCode = (code) => {
    try {
      // If running in Electron, use Electron's clipboard via IPC
      if (ipcRenderer) {
        ipcRenderer.invoke('clipboard-write', code)
          .then(() => {
            setCopiedSnack({
              open: true,
              message: "Code copied to clipboard!"
            });
          })
          .catch(err => {
            console.error('Failed to copy via IPC:', err);
            // Fall back to other methods
            fallbackCopy(code);
          });
        return;
      }
      
      // Fallback to the Web Clipboard API
      fallbackCopy(code);
    } catch (error) {
      console.error('Copy operation failed:', error);
      setCopiedSnack({
        open: true,
        message: "Failed to copy code"
      });
    }
  };

  const fallbackCopy = (code) => {
    navigator.clipboard.writeText(code).then(
      () => {
        setCopiedSnack({
          open: true,
          message: "Code copied to clipboard!"
        });
      },
      (err) => {
        console.error('Could not copy text: ', err);
        
        // Try alternate approach for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = code;
        textArea.style.position = 'fixed';  // Prevent scrolling to bottom
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
          const successful = document.execCommand('copy');
          const msg = successful ? 'Code copied to clipboard!' : 'Failed to copy code';
          setCopiedSnack({
            open: true,
            message: msg
          });
        } catch (err) {
          console.error('Fallback copy failed:', err);
          setCopiedSnack({
            open: true,
            message: "Failed to copy code"
          });
        }
        
        document.body.removeChild(textArea);
      }
    );
  };

  // Function to handle clearing the chat
  const handleClearChat = () => {
    setClearDialogOpen(true);
  };
  
  // Function to confirm and clear the chat
  const confirmClearChat = () => {
    setMessages([]);
    setCurrentResponse('');
    setCapturedText('');
    setSuggestedQueries([]);
    setEmailData(null);
    setClearDialogOpen(false);
    localStorage.removeItem('chat_messages');
    
    // Show notification
    setInfoSnack({
      open: true,
      message: "Chat cleared successfully!"
    });
  };
  
  // Function to cancel clearing the chat
  const cancelClearChat = () => {
    setClearDialogOpen(false);
  };

  // Revert to the original suggested queries
  useEffect(() => {
    // Check if the user is authenticated with Google Calendar
    const checkCalendarAuth = async () => {
      const isAuthenticated = calendarService.isAuthenticated();
      setIsCalendarAvailable(isAuthenticated);
      
      // Set initial messages if this is the first load
      if (messages.length === 0) {
        setMessages([
          { 
            text: "👋 Welcome! I'm your AI assistant. I can help you with various tasks like solving SQL queries and scheduling meetings.", 
            sender: 'ai' 
          }
        ]);
        
        // Set initial suggested queries
        setSuggestedQueries([
          "Connect to Google Calendar",
          "Schedule a meeting with Jane tomorrow at 3pm",
          "Capture my screen",
          "What can you help me with?"
        ]);
      }
    };
    
    // Check initially
    checkCalendarAuth();
    
    // Set up interval to check periodically (every 5 minutes)
    const intervalId = setInterval(checkCalendarAuth, 5 * 60 * 1000);
    
    // Clean up the interval when component unmounts
    return () => clearInterval(intervalId);
  }, [messages.length]); // Only depend on messages.length to avoid re-running constantly

  // Original handleSend function with LLM context detection
  const handleSend = async () => {
    if (!message.trim() || isLoading) return;
    
    // Clear any active typewriter effect
    if (typingInterval) {
      clearInterval(typingInterval);
      setTypingInterval(null);
    }
    
    // Check if the user is confirming a meeting
    if (isMeetingRelated && meetingDetails && /confirm|yes|accept/i.test(message.trim())) {
      // Handle it as a meeting confirmation
      setMessage('');
      handleConfirmMeeting();
      return;
    }
    
    // Check if the user is rescheduling a meeting with words like "reschedule", "change time", etc.
    if (isMeetingRelated && meetingDetails && /reschedule|change(\s+the)?\s+time|different time|another time/i.test(message.trim())) {
      // Handle it as a meeting reschedule
      setMessage('');
      handleRescheduleMeeting();
      return;
    }
    
    // Add the user's message to the chat
    const userMessageText = message;
    const userMessage = { id: Date.now(), sender: 'user', text: userMessageText };
    setMessages(prev => [...prev, userMessage]);
    setMessage('');
    setIsLoading(true);
    
    // Directly check for scheduling requests with specific patterns like "Schedule a meeting on 31-03-2025 at 5 pm"
    const directSchedulingMatch = userMessageText.match(/schedule\s+(?:a|an)?\s*meeting\s+on\s+(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
    
    if (directSchedulingMatch) {
      try {
        const extractedDate = directSchedulingMatch[1];
        const extractedTime = directSchedulingMatch[2];
        
        console.log("Direct meeting scheduling detected:", { date: extractedDate, time: extractedTime });
        
        // Extract any title/purpose context
        let purpose = 'Meeting';
        const titleMatch = userMessageText.match(/(?:about|for|to discuss)\s+['"]?([^'".,]+)['"]?/i);
        if (titleMatch) {
          purpose = titleMatch[1].trim();
        }
        
        // Extract any attendees
        let attendees = [];
        const attendeeMatch = userMessageText.match(/(?:with|including)\s+([^.,]+)/i);
        if (attendeeMatch) {
          const potentialAttendees = attendeeMatch[1].split(/,|\s+and\s+/);
          attendees = potentialAttendees.map(a => a.trim()).filter(a => a);
        }
        
        const meetingDetail = {
          date: extractedDate,
          time: extractedTime,
          purpose: purpose,
          participants: attendees
        };
        
        // Create a loading message
        setMessages(prev => [...prev, { 
          text: `Creating your meeting on ${extractedDate} at ${extractedTime}...`, 
          sender: 'ai' 
        }]);
        
        // Schedule the meeting
        await scheduleMeeting(meetingDetail);
        
        // Send success message
        const successMessage = `I've scheduled your meeting${purpose !== 'Meeting' ? ` about "${purpose}"` : ''} on ${extractedDate} at ${extractedTime}`;
        
        setMessages(prev => [...prev, { 
          text: successMessage, 
          sender: 'ai' 
        }]);
        
        setIsLoading(false);
        return;
      } catch (error) {
        console.error("Error with direct scheduling:", error);
        // Continue with normal processing if direct scheduling fails
      }
    }

    // First check if this is a calendar scheduling request using the LLM
    const containsDateOrTime = /(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|next month|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}(st|nd|rd|th)?|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}:\d{2}|\d{1,2}\s*(am|pm)|noon|midnight)/i.test(userMessageText);
    
    if (containsDateOrTime) {
      try {
        // This might be a calendar scheduling request
        const apiKey = process.env.REACT_APP_GROQ_API_KEY;
        
        // Use a system prompt to check if this is a scheduling request
        const systemPrompt = `
        Determine if the user is trying to schedule a meeting or calendar event.
        If they are, return ONLY the following JSON:
        {
          "isSchedulingRequest": true,
          "eventDetails": {
            "title": "extracted title or meeting purpose",
            "startDate": "extracted date (MM/DD/YYYY format)",
            "startTime": "extracted time (HH:MM AM/PM format)",
            "duration": "extracted duration in minutes or 30 by default",
            "attendees": "extracted attendees/participants (comma separated)"
          }
        }
        
        If they are NOT trying to schedule anything, return ONLY:
        {
          "isSchedulingRequest": false
        }
        `;
        
        // Check if this is a scheduling request
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessageText }
            ],
            temperature: 0.2,
            max_tokens: 1024
          })
        });
        
        if (!response.ok) {
          throw new Error('Failed to check if message is a scheduling request.');
        }
        
        const data = await response.json();
        
        if (data.choices && data.choices.length > 0) {
          const responseText = data.choices[0].message.content;
          
          try {
            // Try to parse the response as JSON
            let parsedResponse;
            
            // Some additional parsing to handle cases where model might add extra text
            try {
              const jsonStart = responseText.indexOf('{');
              const jsonEnd = responseText.lastIndexOf('}') + 1;
              if (jsonStart !== -1 && jsonEnd !== -1) {
                parsedResponse = JSON.parse(responseText.substring(jsonStart, jsonEnd));
              } else {
                parsedResponse = JSON.parse(responseText);
              }
            } catch (e) {
              console.error("Error parsing JSON response:", e);
              parsedResponse = { isSchedulingRequest: false };
            }
            
            if (parsedResponse.isSchedulingRequest) {
              const eventDetails = parsedResponse.eventDetails || {};
              
              // For consistency, recreate the event details
              const extractedDetails = {
                title: eventDetails.title || "Meeting",
                startDate: eventDetails.startDate || "not specified",
                startTime: eventDetails.startTime || "not specified",
                duration: eventDetails.duration || "30",
                attendees: eventDetails.attendees || ""
              };
              
              try {
                // Now we have event details, we can try to schedule it
                await handleCreateCalendarEvent(extractedDetails);
                
                // Send normal message to API
                await sendToGroq([...messages, userMessage]);
                return;
              } catch (error) {
                console.error("Error scheduling event:", error);
                // Send normal message to API if scheduling fails
              }
            }
          } catch (error) {
            console.error("Error processing scheduling response:", error);
          }
        }
      } catch (error) {
        console.error("Error checking for scheduling intent:", error);
      }
    }

    // If we got here, we're handling a regular message (not scheduling)
    await sendToGroq([...messages, userMessage]);
  };

  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('info');
  const [openSnackbar, setOpenSnackbar] = useState(false);

  const showSnackbar = (message, severity = 'info') => {
    setSnackbarMessage(message);
    setSnackbarSeverity(severity);
    setOpenSnackbar(true);
  };

  const handleCloseSnackbar = () => {
    setOpenSnackbar(false);
  };

  // New function to analyze emails for scheduling intent
  const analyzeEmailForScheduling = async (emailContent) => {
    // Guard clause to prevent starting duplicate analysis
    if (!emailContent || emailContent.trim() === '') {
      console.log("Empty email content, skipping analysis");
      setEmailAnalysisInProgress(false);
      return;
    }
    
    console.log("Starting email analysis...");
    
    try {
      setIsLoading(true);
      console.log("Analyzing email for scheduling...");
      
      const apiKey = process.env.REACT_APP_GROQ_API_KEY;
      if (!apiKey) {
        throw new Error('Groq API key is not configured.');
      }
      
      // Create system message for email analysis
      const systemPrompt = `
      Analyze the following email content to determine if it's about scheduling a meeting.
      If it is about scheduling a meeting, extract the following information:
      1. The proposed date and time
      2. The purpose of the meeting
      3. The participants or attendees
      4. Any other relevant details
      
      Return a JSON object with the following structure:
      {
        "isMeetingRequest": true/false,
        "date": "extracted date or null",
        "time": "extracted time or null",
        "purpose": "purpose of the meeting or null",
        "participants": ["list", "of", "participants"] or [],
        "other_details": "other details or null"
      }
      
      Only return valid JSON. Do not include any other text in your response.
      `;
      
      // Make API call to analyze the email
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: emailContent }
          ],
          temperature: 0.2,
          max_tokens: 1024
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `API request failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log("Analysis response:", data);
      
      if (data.choices && data.choices.length > 0) {
        try {
          // Parse the JSON response
          const responseText = data.choices[0].message.content;
          console.log("Raw LLM response:", responseText);
          
          // Extract JSON from the response - handle cases where the model might add extra text
          let jsonStr = responseText;
          const jsonMatch = responseText.match(/(\{[\s\S]*\})/);
          if (jsonMatch) {
            jsonStr = jsonMatch[1];
          }
          
          const analysisResult = JSON.parse(jsonStr);
          console.log("Parsed analysis result:", analysisResult);
          
          // If this is a meeting request
          if (analysisResult.isMeetingRequest && (analysisResult.date || analysisResult.time)) {
            // Format meeting details
            const meetingDate = analysisResult.date || "not specified";
            const meetingTime = analysisResult.time || "not specified";
            const meetingPurpose = analysisResult.purpose || "Meeting";
            
            console.log("Meeting detected, adding buttons");
            
            // Add message to chat with buttons
            setMessages(prev => [...prev, {
              text: `I detected a meeting request in the email for ${meetingTime} on ${meetingDate}${analysisResult.purpose ? ` about "${analysisResult.purpose}"` : ""}.
              
Would you like to confirm this meeting or reschedule it?`,
              sender: 'ai',
              buttons: [
                {
                  text: 'Confirm Meeting',
                  action: 'confirm',
                  handler: () => handleMeetingAction('confirm', {
                    date: meetingDate,
                    time: meetingTime,
                    purpose: meetingPurpose,
                    participants: analysisResult.participants || []
                  })
                },
                {
                  text: 'Reschedule',
                  action: 'reschedule',
                  handler: () => handleMeetingAction('reschedule', {
                    date: meetingDate,
                    time: meetingTime,
                    purpose: meetingPurpose,
                    participants: analysisResult.participants || []
                  })
                }
              ]
            }]);
          } else {
            // Not a meeting request or missing date/time
            console.log("No meeting details detected in email");
            setInfoSnack({
              open: true,
              message: "Captured email content, but no specific meeting details were detected."
            });
            
            // Try a direct regex extraction as fallback
            const dateTimeRegex = /(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)?).*?(\d{1,2}(?:\s+|-|\/|\.)?(?:January|February|March|April|May|June|July|August|September|October|November|December|\d{1,2})(?:\s+|-|\/|\.)?\d{2,4})/i;
            const altDateTimeRegex = /(\d{1,2}(?:\s+|-|\/|\.)?(?:January|February|March|April|May|June|July|August|September|October|November|December|\d{1,2})(?:\s+|-|\/|\.)?\d{2,4}).*?(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)/i;
            const timeOnlyRegex = /(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))/i;
            const dateOnlyRegex = /(\d{1,2}(?:\s+|-|\/|\.)?(?:January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+|-|\/|\.)?\d{2,4})/i;
            
            const match1 = emailContent.match(dateTimeRegex);
            const match2 = emailContent.match(altDateTimeRegex);
            const timeMatch = emailContent.match(timeOnlyRegex);
            const dateMatch = emailContent.match(dateOnlyRegex);
            
            if (match1 || match2 || (timeMatch && dateMatch)) {
              console.log("Regex-based date/time extraction succeeded");
              let time, date;
              
              if (match1) {
                time = match1[1];
                date = match1[2];
              } else if (match2) {
                date = match2[1];
                time = match2[2];
              } else if (timeMatch && dateMatch) {
                time = timeMatch[1];
                date = dateMatch[1];
              }
              
              setMessages(prev => [...prev, {
                text: `I found a possible meeting suggestion in the email for ${time} on ${date}. Would you like to schedule this?`,
                sender: 'ai',
                buttons: [
                  {
                    text: 'Schedule Meeting',
                    action: 'confirm',
                    handler: () => handleMeetingAction('confirm', {
                      date: date,
                      time: time,
                      purpose: "Meeting from email",
                      participants: []
                    })
                  },
                  {
                    text: 'Decline',
                    action: 'decline',
                    handler: () => {
                      setMessages(prev => [...prev, { 
                        text: "I won't schedule this meeting. If you change your mind, you can ask me to schedule it later.", 
                        sender: 'ai' 
                      }]);
                    }
                  }
                ]
              }]);
            }
          }
        } catch (error) {
          console.error("Error parsing LLM response:", error);
          setErrorSnack({
            open: true,
            message: "Failed to analyze email content: " + error.message
          });
        }
      }
    } catch (error) {
      console.error("Error analyzing email:", error);
      setErrorSnack({
        open: true,
        message: `Error analyzing email: ${error.message}`
      });
    } finally {
      setIsLoading(false);
      // Reset the flag when analysis is complete
      setEmailAnalysisInProgress(false);
      console.log("Email analysis completed, flag reset to false");
    }
  };

  // Handler for meeting action buttons
  const handleMeetingAction = async (action, meetingDetails) => {
    if (action === 'confirm') {
      // Schedule the meeting
      await scheduleMeeting(meetingDetails);
      
      // Add confirmation message
      setMessages(prev => [...prev, { 
        text: `Meeting scheduled for ${meetingDetails.time} on ${meetingDetails.date}.`, 
        sender: 'ai' 
      }]);
    } else if (action === 'reschedule') {
      // Add message about rescheduling
      setMessages(prev => [...prev, { 
        text: `I'll help you draft an email to reschedule the meeting originally proposed for ${meetingDetails.time} on ${meetingDetails.date}. What time would work better for you?`, 
        sender: 'ai',
        rescheduling: {
          originalDate: meetingDetails.date,
          originalTime: meetingDetails.time,
          purpose: meetingDetails.purpose,
          participants: meetingDetails.participants
        }
      }]);
      
      // Set up suggested responses for rescheduling
      setSuggestedQueries([
        "Tomorrow morning",
        "Later this week",
        "Next week",
        "Same time next week"
      ]);
    }
  };

  // Modified scheduleMeeting function with fixed date handling
  const scheduleMeeting = async (meetingDetails) => {
    try {
      console.log("Scheduling meeting with details:", meetingDetails);
      
      // Validate and filter participant emails
      let validParticipants = [];
      if (meetingDetails.participants && Array.isArray(meetingDetails.participants)) {
        // Email validation regex
        const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
        
        // Filter out invalid emails
        validParticipants = meetingDetails.participants
          .filter(participant => typeof participant === 'string' && emailRegex.test(participant));
        
        if (meetingDetails.participants.length > 0 && validParticipants.length === 0) {
          console.warn("No valid participant emails found, creating event without attendees");
        }
      }
      
      // Simplify date handling - this is the most reliable approach 
      let startDateTime, endDateTime;
      
      console.log("Date matching test:", meetingDetails.date, 
                  "DD-MM-YYYY test:", meetingDetails.date && typeof meetingDetails.date === 'string' && /^\d{1,2}-\d{1,2}-\d{4}$/.test(meetingDetails.date));
      
      // First try standard format parsing - this works in many cases
      try {
        if (meetingDetails.date && meetingDetails.time) {
          // Try with various common formats
          let testDate = new Date(`${meetingDetails.date} ${meetingDetails.time}`);
          if (!isNaN(testDate.getTime())) {
            console.log("Standard date parsing succeeded:", testDate);
            startDateTime = testDate;
            endDateTime = new Date(testDate.getTime() + 60 * 60 * 1000); // 1 hour later
            
            // Skip the manual parsing
            throw new Error("SKIP_MANUAL_PARSING");
          }
        }
      } catch (err) {
        if (err.message === "SKIP_MANUAL_PARSING") {
          // Just continue with the dates we already successfully created
          console.log("Using standard parsed dates:", { start: startDateTime, end: endDateTime });
        } else {
          // Continue to manual parsing
          console.log("Standard date parsing failed, falling back to manual:", err);
        }
      }
      
      // If standard parsing failed, try manual parsing
      if (!startDateTime) {
        // If we're dealing with DD-MM-YYYY format (like 31-03-2025)
        if (meetingDetails.date && typeof meetingDetails.date === 'string') {
          // Test all possible date patterns
          const ddmmyyyyHyphen = meetingDetails.date.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
          const ddmmyyyySlash = meetingDetails.date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
          
          // Log matching results for debugging
          console.log("Date patterns:", { 
            hyphenMatch: ddmmyyyyHyphen, 
            slashMatch: ddmmyyyySlash 
          });
          
          if (ddmmyyyyHyphen) {
            // Format is DD-MM-YYYY
            const day = parseInt(ddmmyyyyHyphen[1], 10);
            const month = parseInt(ddmmyyyyHyphen[2], 10) - 1; // JS months are 0-indexed
            const year = parseInt(ddmmyyyyHyphen[3], 10);
            
            console.log(`Parsed hyphen date: Day=${day}, Month=${month+1}, Year=${year}`);
            
            // Parse time separately
            let hours = 9, minutes = 0;
            
            if (meetingDetails.time) {
              console.log("Parsing time:", meetingDetails.time);
              
              // Try all possible time formats
              const timeWithSpacePM = meetingDetails.time.match(/(\d{1,2})\s*([ap]m)/i);
              const timeWithoutSpace = meetingDetails.time.match(/(\d{1,2})([ap]m)/i);
              const timeWithColon = meetingDetails.time.match(/(\d{1,2}):(\d{2})(?:\s*([ap]m))?/i);
              
              console.log("Time patterns:", {
                timeWithSpacePM,
                timeWithoutSpace,
                timeWithColon
              });
              
              if (timeWithSpacePM) {
                // Format like "5 pm" or "10 AM"
                hours = parseInt(timeWithSpacePM[1], 10);
                const isPM = timeWithSpacePM[2].toLowerCase() === 'pm';
                
                if (isPM && hours < 12) hours += 12;
                if (!isPM && hours === 12) hours = 0;
              } else if (timeWithoutSpace) {
                // Format like "5pm" or "10AM"
                hours = parseInt(timeWithoutSpace[1], 10);
                const isPM = timeWithoutSpace[2].toLowerCase() === 'pm';
                
                if (isPM && hours < 12) hours += 12;
                if (!isPM && hours === 12) hours = 0;
              } else if (timeWithColon) {
                // Format like "17:30" or "5:30 PM"
                hours = parseInt(timeWithColon[1], 10);
                minutes = parseInt(timeWithColon[2], 10);
                
                const isPM = timeWithColon[3] && timeWithColon[3].toLowerCase() === 'pm';
                if (isPM && hours < 12) hours += 12;
                else if (timeWithColon[3] && timeWithColon[3].toLowerCase() === 'am' && hours === 12) hours = 0;
              }
              
              console.log(`Final time: Hours=${hours}, Minutes=${minutes}`);
            }
            
            // Create date objects with the explicit year, month, day, hours, minutes
            try {
              console.log(`Creating date with: Year=${year}, Month=${month}, Day=${day}, Hours=${hours}, Minutes=${minutes}`);
              startDateTime = new Date(year, month, day, hours, minutes);
              endDateTime = new Date(year, month, day, hours + 1, minutes); // 1 hour meeting
              
              // Validate the created date
              if (isNaN(startDateTime.getTime())) {
                throw new Error("Invalid date created");
              }
              
              console.log("Successfully created dates:", {
                start: startDateTime.toISOString(),
                end: endDateTime.toISOString()
              });
            } catch (dateErr) {
              console.error("Error creating date:", dateErr);
              
              // Fallback to a valid date
              const tomorrow = new Date();
              tomorrow.setDate(tomorrow.getDate() + 1);
              tomorrow.setHours(hours, minutes, 0, 0);
              
              startDateTime = tomorrow;
              endDateTime = new Date(tomorrow.getTime() + 60 * 60 * 1000);
            }
          } else if (ddmmyyyySlash) {
            // Handle DD/MM/YYYY format similarly
            const day = parseInt(ddmmyyyySlash[1], 10);
            const month = parseInt(ddmmyyyySlash[2], 10) - 1; // JS months are 0-indexed
            const year = parseInt(ddmmyyyySlash[3], 10);
            
            console.log(`Parsed slash date: Day=${day}, Month=${month+1}, Year=${year}`);
            
            // Parse time (same as above)
            let hours = 9, minutes = 0;
            
            if (meetingDetails.time) {
              const timeMatch = meetingDetails.time.match(/(\d{1,2})(?::(\d{2}))?\s*([ap]m)?/i);
              if (timeMatch) {
                hours = parseInt(timeMatch[1], 10);
                minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
                
                if (timeMatch[3] && timeMatch[3].toLowerCase() === 'pm' && hours < 12) {
                  hours += 12;
                } else if (timeMatch[3] && timeMatch[3].toLowerCase() === 'am' && hours === 12) {
                  hours = 0;
                }
              }
            }
            
            // Create date objects
            startDateTime = new Date(year, month, day, hours, minutes);
            endDateTime = new Date(year, month, day, hours + 1, minutes);
            
            console.log("Created dates:", {
              start: startDateTime.toISOString(),
              end: endDateTime.toISOString()
            });
          } else {
            // For other date formats, try some common conversions
            let dateStr = meetingDetails.date;
            let timeStr = meetingDetails.time || "09:00";
            
            // Try to convert to YYYY-MM-DD format for better compatibility
            const ukDateMatch = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
            if (ukDateMatch) {
              const day = ukDateMatch[1];
              const month = ukDateMatch[2];
              const year = ukDateMatch[3];
              dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
              console.log("Converted UK date format to ISO:", dateStr);
            }
            
            try {
              // Combine and parse
              const combinedDateStr = `${dateStr}T${timeStr}`;
              const date = new Date(combinedDateStr);
              
              if (!isNaN(date.getTime())) {
                startDateTime = date;
                endDateTime = new Date(date.getTime() + 60 * 60 * 1000);
                console.log("Parsed with combined approach:", startDateTime);
              } else {
                throw new Error("Invalid date created with combined approach");
              }
            } catch (err) {
              console.error("Combined date approach failed:", err);
              
              // Default to tomorrow at specified time or 9 AM
              const tomorrow = new Date();
              tomorrow.setDate(tomorrow.getDate() + 1);
              
              // Try to extract hours and minutes from timeStr
              let hours = 9, minutes = 0;
              const timeMatch = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*([ap]m)?/i);
              if (timeMatch) {
                hours = parseInt(timeMatch[1], 10);
                minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
                
                if (timeMatch[3] && timeMatch[3].toLowerCase() === 'pm' && hours < 12) {
                  hours += 12;
                } else if (timeMatch[3] && timeMatch[3].toLowerCase() === 'am' && hours === 12) {
                  hours = 0;
                }
              }
              
              tomorrow.setHours(hours, minutes, 0, 0);
              startDateTime = tomorrow;
              endDateTime = new Date(tomorrow.getTime() + 60 * 60 * 1000);
            }
          }
        } else {
          // Default to tomorrow at 9 AM
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(9, 0, 0, 0);
          
          startDateTime = tomorrow;
          endDateTime = new Date(tomorrow.getTime() + 60 * 60 * 1000); // 1 hour later
        }
      }
      
      // Final validation
      if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
        throw new Error("Invalid dates created after all parsing attempts");
      }
      
      // Format meeting title and description
      const meetingTitle = `Meeting: ${meetingDetails.purpose || 'Discussion'}`;
      const meetingDesc = `Meeting ${meetingDetails.purpose ? `about ${meetingDetails.purpose}` : ''} on ${meetingDetails.date} at ${meetingDetails.time}`;
      
      console.log("Creating event with:", {
        title: meetingTitle,
        description: meetingDesc,
        start: startDateTime.toISOString(),
        end: endDateTime.toISOString()
      });
      
      // Skip the formatEvent method and directly create the event object
      // This bypasses the date validation in calendarService.formatEvent
      const eventData = {
        summary: meetingTitle,
        description: meetingDesc,
        start: {
          dateTime: startDateTime.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        end: {
          dateTime: endDateTime.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        attendees: validParticipants.map(email => ({ email }))
      };

      // Call the API to create the event
      const result = await calendarService.createEvent("primary", eventData);
      console.log("Calendar event created successfully:", result);
      showSnackbar("Meeting scheduled successfully!", "success");
      
      return result;
    } catch (error) {
      console.error("Error scheduling meeting:", error);
      showSnackbar(`Failed to schedule meeting: ${error.message}`, "error");
      throw error;
    }
  };

  // Add a function to check for upcoming meetings
  const checkUpcomingMeetings = useCallback(async () => {
    try {
      if (!isCalendarAvailable) return;

      // Get current time
      const now = new Date();
      
      // Time 2 hours from now
      const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      
      // Format times in ISO format for API
      const timeMin = now.toISOString();
      const timeMax = twoHoursFromNow.toISOString();

      // Get events in the next 2 hours
      const events = await calendarService.listEvents('primary', timeMin, 10, timeMax);
      
      if (events && events.items && events.items.length > 0) {
        // Sort events by start time
        events.items.sort((a, b) => {
          const aTime = new Date(a.start.dateTime || a.start.date);
          const bTime = new Date(b.start.dateTime || b.start.date);
          return aTime - bTime;
        });

        // Get the earliest event
        const nextEvent = events.items[0];
        const eventTime = new Date(nextEvent.start.dateTime || nextEvent.start.date);
        const minutesUntil = Math.floor((eventTime - now) / (60 * 1000));
        
        // Only show alert if meeting is within 2 hours
        if (minutesUntil <= 120) {
          // Show dialog about upcoming meeting
          setUpcomingMeeting({
            open: true,
            event: nextEvent,
            minutesUntil
          });
        }
      }
    } catch (error) {
      console.error("Error checking upcoming meetings:", error);
    }
  }, [isCalendarAvailable]);

  // Add state for upcoming meeting dialog
  const [upcomingMeeting, setUpcomingMeeting] = useState({ open: false, event: null, minutesUntil: 0 });

  // Close upcoming meeting dialog
  const handleCloseUpcomingMeetingDialog = () => {
    setUpcomingMeeting({...upcomingMeeting, open: false});
  };

  // Check for upcoming meetings every 5 minutes and on initial load
  useEffect(() => {
    if (isCalendarAvailable) {
      // Check immediately when calendar becomes available
      checkUpcomingMeetings();
      
      // Then check every 5 minutes
      const meetingCheckInterval = setInterval(() => {
        checkUpcomingMeetings();
      }, 5 * 60 * 1000);
      
      return () => clearInterval(meetingCheckInterval);
    }
  }, [isCalendarAvailable, checkUpcomingMeetings]);

  const handleVisualize = () => {
    if (capturedText) {
      console.log("Attempting to visualize captured text");
      
      // Get SQL query first, as it may contain important context
      const sqlQuery = extractSQLQuery(capturedText);
      
      // Try to extract data from the captured text
      const tableData = parseTableData(capturedText);
      
      console.log("Parsing results:", { 
        hasTableData: !!tableData, 
        rowCount: tableData ? tableData.length : 0,
        hasSqlQuery: !!sqlQuery
      });
      
      // Update hasSQL state if SQL was detected
      if (sqlQuery) {
        setHasSQL(true);
      }
      
      if (tableData && tableData.length > 0) {
        console.log("Table data sample:", tableData[0]);
        
        // Check if this is just a count result
        const isCountResult = tableData.length === 1 && 
                              Object.keys(tableData[0]).length === 1 && 
                              Object.keys(tableData[0])[0].toLowerCase().includes('count');
        
        // Log that we detected a count result
        if (isCountResult) {
          console.log("Detected count result:", tableData[0]);
        }
        
        // Set SQL data and open visualization
        setSqlData(tableData);
        setSqlQuery(sqlQuery || '');
        setSqlVisualizationOpen(true);
      } else {
        console.warn("Failed to extract table data from captured text");
        setErrorSnack({
          open: true,
          message: "Could not parse table data from the captured content. Try capturing a clearer view of the table."
        });
      }
    } else {
      setErrorSnack({
        open: true,
        message: "No screen content captured yet. Please capture a screen with data first."
      });
    }
  };

  const handleCloseVisualization = () => {
    setSqlVisualizationOpen(false);
  };

  // Handle meeting confirmation dialog close
  const handleCloseMeetingConfirmation = () => {
    setShowMeetingConfirmation(false);
  };

  // Handle meeting confirmation
  const handleConfirmMeeting = () => {
    if (!meetingDetails) return;
    
    // Create a meeting message for the chat
    const messageText = `I confirm the meeting${meetingDetails.date ? ' on ' + meetingDetails.date : ''}${meetingDetails.time ? ' at ' + meetingDetails.time : ''}.`;
    
    // Add the user's confirmation message to the chat
    const newMessage = { id: Date.now(), sender: 'user', text: messageText };
    setMessages(prev => [...prev, newMessage]);
    
    // Automatically respond to confirm
    setTimeout(() => {
      const aiMessage = { 
        id: Date.now() + 1, 
        sender: 'ai', 
        text: `Great! I've confirmed your meeting${meetingDetails.date ? ' on ' + meetingDetails.date : ''}${meetingDetails.time ? ' at ' + meetingDetails.time : ''}. It's been added to your calendar.` 
      };
      setMessages(prev => [...prev, aiMessage]);
      
      // If the calendar is available, schedule the meeting using our fixed function
      if (isCalendarAvailable) {
        scheduleMeeting(meetingDetails);
      }
    }, 800);
    
    setShowMeetingConfirmation(false);
  };

  // Handle meeting reschedule
  const handleRescheduleMeeting = () => {
    if (!meetingDetails) return;
    
    // Create a reschedule message
    const messageText = "I'd like to reschedule this meeting. Can we find another time?";
    
    // Add the user's message to the chat
    const newMessage = { id: Date.now(), sender: 'user', text: messageText };
    setMessages(prev => [...prev, newMessage]);
    
    // Automatically respond to ask for a new time
    setTimeout(() => {
      const aiMessage = { 
        id: Date.now() + 1, 
        sender: 'ai', 
        text: "Of course! What date and time would work better for you?" 
      };
      setMessages(prev => [...prev, aiMessage]);
    }, 800);
    
    setShowMeetingConfirmation(false);
  };

  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100%', 
      p: 2 
    }}>
      {/* Chat Header with Clear Button and Calendar Status */}
      <Box sx={{ 
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        mb: 2
      }}>
        {isCalendarAvailable ? (
          <Tooltip title="Calendar Connected - Click to view your events">
            <Chip 
              icon={<Event />} 
              label="Calendar Connected" 
              color="primary" 
              size="small"
              onClick={handleCalendarClick}
              sx={{ cursor: 'pointer' }} 
            />
          </Tooltip>
        ) : (
          <Tooltip title="Connect to Google Calendar">
            <Chip 
              icon={<Event />} 
              label="Calendar Not Connected" 
              color="default" 
              size="small"
              onClick={handleCalendarClick}
              sx={{ cursor: 'pointer' }} 
            />
          </Tooltip>
        )}
        
        <Tooltip title="Clear Chat">
          <IconButton
            onClick={handleClearChat}
            sx={{
              color: '#90caf9',
              '&:hover': {
                backgroundColor: 'rgba(144, 202, 249, 0.1)',
              },
            }}
          >
            <DeleteSweep />
          </IconButton>
        </Tooltip>
      </Box>
      
      {/* Chat messages area */}
      <Box sx={{ 
        flexGrow: 1, 
        mb: 2, 
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 1
      }}>
        {messages.length === 0 ? (
          <Box 
            sx={{ 
              display: 'flex', 
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              opacity: 0.7
            }}
          >
            <Typography variant="h6" color="text.secondary">
              No messages yet
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Start a conversation or capture screen content
            </Typography>
          </Box>
        ) : (
          messages.map((msg, index) => {
            const isUser = msg.sender === 'user';
            const formattedParts = isUser ? null : formatMessageWithCodeBlocks(msg.text);
            
            return (
              <Paper 
                key={index}
                sx={{
                  p: 2,
                  maxWidth: '70%',
                  alignSelf: isUser ? 'flex-end' : 'flex-start',
                  backgroundColor: isUser ? '#3d4a5c' : (msg.isCapture ? '#2c5050' : '#2d2d2d'),
                  borderRadius: 16
                }}
              >
                {isUser ? (
                  msg.text
                ) : (
                  <>
                    {formattedParts ? (
                      formattedParts.map((part, i) => {
                        if (part.type === 'text') {
                          return <Box key={i} sx={{ whiteSpace: 'pre-wrap' }}>{part.content}</Box>;
                        } else if (part.type === 'code') {
                          return (
                            <Box 
                              key={i} 
                              sx={{ 
                                position: 'relative',
                                my: 2,
                                backgroundColor: 'rgba(30,30,30,0.9)',
                                borderRadius: 1,
                                p: 2,
                                overflow: 'auto',
                                border: '1px solid rgba(255,255,255,0.1)',
                                boxShadow: '0 4px 8px rgba(0,0,0,0.15)',
                                '&:hover .copy-button': {
                                  opacity: 1
                                }
                              }}
                            >
                              <Box 
                                sx={{ 
                                  position: 'absolute',
                                  top: 0,
                                  right: 0,
                                  padding: '4px',
                                  backgroundColor: 'rgba(0,0,0,0.4)',
                                  borderBottomLeftRadius: 4,
                                  display: 'flex',
                                  alignItems: 'center'
                                }}
                              >
                                {part.language !== 'plaintext' && part.language !== '' && (
                                  <Typography 
                                    variant="caption" 
                                    sx={{ 
                                      color: 'rgba(255,255,255,0.7)', 
                                      mr: 1,
                                      textTransform: 'uppercase',
                                      fontSize: '0.65rem',
                                      fontWeight: 'bold'
                                    }}
                                  >
                                    {part.language}
                                  </Typography>
                                )}
                                <Tooltip title="Copy code">
                                  <IconButton 
                                    className="copy-button"
                                    onClick={() => handleCopyCode(part.content)}
                                    sx={{ 
                                      opacity: 0.7,
                                      color: 'white',
                                      transition: 'opacity 0.2s',
                                      padding: '4px',
                                      '&:hover': {
                                        backgroundColor: 'rgba(255,255,255,0.1)',
                                        opacity: 1
                                      }
                                    }}
                                    size="small"
                                  >
                                    <ContentCopy fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                              <Typography 
                                component="pre" 
                                sx={{ 
                                  whiteSpace: 'pre-wrap',
                                  overflowX: 'auto',
                                  wordBreak: 'break-word',
                                  fontFamily: 'Consolas, Monaco, "Andale Mono", monospace',
                                  fontSize: '0.9rem',
                                  m: 0,
                                  pt: 1
                                }}
                              >
                                <code>
                                  {part.content}
                                </code>
                              </Typography>
                            </Box>
                          );
                        }
                        return null;
                      })
                    ) : (
                      msg.text
                    )}
                    
                    {/* Render buttons if present */}
                    {msg.buttons && msg.buttons.length > 0 && (
                      <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
                        {msg.buttons.map((button, i) => (
                          <Button
                            key={i}
                            variant="contained"
                            color={button.action === 'confirm' ? 'success' : 'primary'}
                            size="small"
                            onClick={button.handler}
                            sx={{ textTransform: 'none' }}
                          >
                            {button.text}
                          </Button>
                        ))}
                      </Box>
                    )}
                  </>
                )}
              </Paper>
            );
          })
        )}
        {currentResponse && (
          <Paper 
            sx={{
              p: 2,
              maxWidth: '70%',
              alignSelf: 'flex-start',
              backgroundColor: '#2d2d2d',
              borderRadius: 16
            }}
          >
            {formatMessageWithCodeBlocks(currentResponse).map((part, i) => {
              if (part.type === 'text') {
                return <Box key={i} sx={{ whiteSpace: 'pre-wrap' }}>{part.content}</Box>;
              } else if (part.type === 'code') {
                return (
                  <Box 
                    key={i} 
                    sx={{ 
                      position: 'relative',
                      my: 2,
                      backgroundColor: 'rgba(30,30,30,0.9)',
                      borderRadius: 1,
                      p: 2,
                      overflow: 'auto',
                      border: '1px solid rgba(255,255,255,0.1)',
                      boxShadow: '0 4px 8px rgba(0,0,0,0.15)',
                      '&:hover .copy-button': {
                        opacity: 1
                      }
                    }}
                  >
                    <Box 
                      sx={{ 
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        padding: '4px',
                        backgroundColor: 'rgba(0,0,0,0.4)',
                        borderBottomLeftRadius: 4,
                        display: 'flex',
                        alignItems: 'center'
                      }}
                    >
                      {part.language !== 'plaintext' && part.language !== '' && (
                        <Typography 
                          variant="caption" 
                          sx={{ 
                            color: 'rgba(255,255,255,0.7)', 
                            mr: 1,
                            textTransform: 'uppercase',
                            fontSize: '0.65rem',
                            fontWeight: 'bold'
                          }}
                        >
                          {part.language}
                        </Typography>
                      )}
                      <Tooltip title="Copy code">
                        <IconButton 
                          className="copy-button"
                          onClick={() => handleCopyCode(part.content)}
                          sx={{ 
                            opacity: 0.7,
                            color: 'white',
                            transition: 'opacity 0.2s',
                            padding: '4px',
                            '&:hover': {
                              backgroundColor: 'rgba(255,255,255,0.1)',
                              opacity: 1
                            }
                          }}
                          size="small"
                        >
                          <ContentCopy fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                    <Typography 
                      component="pre" 
                      sx={{ 
                        whiteSpace: 'pre-wrap',
                        overflowX: 'auto',
                        wordBreak: 'break-word',
                        fontFamily: 'Consolas, Monaco, "Andale Mono", monospace',
                        fontSize: '0.9rem',
                        m: 0,
                        pt: 1
                      }}
                    >
                      <code>
                        {part.content}
                      </code>
                    </Typography>
                  </Box>
                );
              }
              return null;
            })}
          </Paper>
        )}
        <div ref={messagesEndRef} />
      </Box>

      {/* Suggested queries based on captured content */}
      {suggestedQueries.length > 0 && (
        <Box sx={{ 
          display: 'flex', 
          flexWrap: 'wrap', 
          gap: 1,
          mb: 2
        }}>
          {emailData && (
            <Chip
              icon={<Email fontSize="small" />}
              label="Email Detected"
              sx={{
                backgroundColor: '#2c5050',
                color: 'white',
                mr: 1
              }}
            />
          )}
          
          {suggestedQueries.map((query, index) => (
            <Chip
              key={index}
              label={query}
              onClick={() => handleSuggestedQuery(query)}
              icon={<SmartToy fontSize="small" />}
              clickable
              sx={{
                backgroundColor: '#4d5d73',
                color: 'white',
                '&:hover': {
                  backgroundColor: '#5f6e83',
                },
              }}
            />
          ))}
        </Box>
      )}

      {/* Input area */}
      <Paper 
        sx={{ 
          p: 1, 
          display: 'flex', 
          alignItems: 'center', 
          backgroundColor: '#2d2d2d',
          borderRadius: 28,
          overflow: 'hidden'
        }}
      >
        <TextField
          fullWidth
          variant="outlined"
          placeholder="Type a message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          disabled={isLoading}
          sx={{
            '& .MuiOutlinedInput-root': {
              backgroundColor: '#3d3d3d',
              borderRadius: 28,
              '& fieldset': {
                borderColor: 'transparent',
                borderRadius: 28
              },
              '&:hover fieldset': {
                borderColor: 'transparent'
              },
              '&.Mui-focused fieldset': {
                borderColor: '#4f5b6d',
                borderWidth: 1
              }
            }
          }}
        />
        {isLoading && typingInterval && (
          <Tooltip title="Complete Response Now">
            <IconButton 
              onClick={pauseTypewriter} 
              sx={{ 
                ml: 1, 
                color: '#ffb74d',
                backgroundColor: '#3d4a5c',
                '&:hover': {
                  backgroundColor: '#4f5b6d',
                },
                height: 40,
                width: 40
              }}
            >
              <Pause />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="Capture Screen Content">
          <IconButton 
            onClick={startScreenCapture} 
            sx={{ 
              ml: 1, 
              color: '#90caf9',
              backgroundColor: '#3d4a5c',
              '&:hover': {
                backgroundColor: '#4f5b6d',
              },
              height: 40,
              width: 40
            }} 
            disabled={isLoading || isCapturing}
          >
            {isCapturing ? <CircularProgress size={24} /> : <ScreenshotMonitor />}
        </IconButton>
        </Tooltip>
        
        {/* Visualization Button - Only shown when SQL data is available */}
        {hasSQL && (
          <Tooltip title="Visualize SQL Data">
            <IconButton 
              onClick={handleVisualize}
              sx={{ 
                ml: 1, 
                color: '#4caf50',
                backgroundColor: '#3d4a5c',
                '&:hover': {
                  backgroundColor: '#4f5b6d',
                },
                height: 40,
                width: 40
              }}
            >
              <BarChart />
            </IconButton>
          </Tooltip>
        )}
        
        <IconButton 
          onClick={handleSend} 
          sx={{ 
            ml: 1, 
            color: '#90caf9',
            backgroundColor: '#3d4a5c',
            '&:hover': {
              backgroundColor: '#4f5b6d',
            },
            height: 40,
            width: 40
          }} 
          disabled={isLoading || !message.trim()}
        >
          {isLoading ? <CircularProgress size={24} /> : <Send />}
        </IconButton>
      </Paper>

      {/* Capture Countdown Dialog */}
      <Dialog open={captureDialogOpen} onClose={cancelScreenCapture}>
        <DialogTitle>
          Preparing to Capture Screen
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Switch to the window you want to capture. This app will be minimized briefly during capture.
          </DialogContentText>
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            mt: 2
          }}>
            <Typography variant="h3" color="primary">
              {captureCountdown}
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelScreenCapture} color="primary">
            Cancel
          </Button>
        </DialogActions>
      </Dialog>

      {/* Error Snackbar */}
      <Snackbar 
        open={errorSnack.open} 
        autoHideDuration={6000} 
        onClose={handleCloseErrorSnack}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseErrorSnack} severity="error" sx={{ width: '100%' }}>
          {errorSnack.message}
        </Alert>
      </Snackbar>

      {/* Info Snackbar */}
      <Snackbar 
        open={infoSnack.open} 
        autoHideDuration={4000} 
        onClose={handleCloseInfoSnack}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={handleCloseInfoSnack} 
          severity="success" 
          sx={{ width: '100%' }}
        >
          {infoSnack.message}
        </Alert>
      </Snackbar>

      {/* Copied Snackbar */}
      <Snackbar 
        open={copiedSnack.open} 
        autoHideDuration={2000} 
        onClose={handleCloseCopiedSnack}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseCopiedSnack} severity="success" sx={{ width: '100%' }}>
          {copiedSnack.message}
        </Alert>
      </Snackbar>

      {/* Clear Chat Confirmation Dialog */}
      <Dialog open={clearDialogOpen} onClose={cancelClearChat}>
        <DialogTitle>
          Clear Chat History
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to clear all messages and captured content? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelClearChat} color="primary">
            Cancel
          </Button>
          <Button 
            onClick={confirmClearChat} 
            color="error"
            variant="contained"
            sx={{ color: 'white' }}
          >
            Clear Everything
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar 
        open={openSnackbar} 
        autoHideDuration={6000} 
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbarSeverity} sx={{ width: '100%' }}>
          {snackbarMessage}
        </Alert>
      </Snackbar>

      {/* Upcoming Meeting Dialog */}
      <Dialog open={upcomingMeeting.open} onClose={handleCloseUpcomingMeetingDialog}>
        <DialogTitle>
          Upcoming Meeting Alert
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            You have a meeting in {upcomingMeeting.minutesUntil} minutes.
          </DialogContentText>
          {upcomingMeeting.event && (
            <>
              <Typography variant="body2" color="text.secondary">
                Meeting: {upcomingMeeting.event.summary || "Untitled Meeting"}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Time: {upcomingMeeting.event && upcomingMeeting.event.start && 
                      upcomingMeeting.event.start.dateTime ? 
                      new Date(upcomingMeeting.event.start.dateTime).toLocaleString() : 
                      "Time not specified"}
              </Typography>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseUpcomingMeetingDialog} color="primary">
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Meeting Confirmation Dialog */}
      <Dialog
        open={showMeetingConfirmation}
        onClose={handleCloseMeetingConfirmation}
        aria-labelledby="meeting-confirmation-dialog-title"
      >
        <DialogTitle id="meeting-confirmation-dialog-title">
          Meeting Request Detected
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {meetingDetails?.date && meetingDetails?.time ? 
              `Would you like to confirm a meeting on ${meetingDetails.date} at ${meetingDetails.time}?` :
              meetingDetails?.date ? 
              `Would you like to confirm a meeting on ${meetingDetails.date}?` :
              meetingDetails?.time ? 
              `Would you like to confirm a meeting at ${meetingDetails.time}?` :
              'Would you like to confirm this meeting?'
            }
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleRescheduleMeeting} color="primary">
            Reschedule
          </Button>
          <Button onClick={handleConfirmMeeting} color="primary" variant="contained">
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      {/* SQL Visualization Dialog */}
      <SimpleBarChart 
        open={sqlVisualizationOpen} 
        onClose={handleCloseVisualization} 
        data={sqlData} 
      />
    </Box>
  );
}

export default ChatInterface; 