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
import { Send, ScreenshotMonitor, Pause, SmartToy, Email, ContentCopy, DeleteSweep, Event } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import Tesseract from 'tesseract.js';
import calendarService from '../utils/calendarService';
// For debugging
console.log("API Key:", process.env.REACT_APP_GROQ_API_KEY);

// Access to electron IPC if running in electron
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
            text: "👋 Welcome! I'm your AI assistant. I can help you with various tasks like solving SQL queries.", 
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

            // Determine if this is an email
            const hasEmailWords = /would like to schedule|meeting|collaboration|availability|email|message/i.test(cleanedText);
            const isEmail = emailData !== null || hasEmailWords;
            
            // Generate suggested queries based on the content
            const suggestions = await generateSuggestedQueries(cleanedText, isEmail);
            setSuggestedQueries(suggestions);

            // Check if the captured content looks like an email about scheduling
            if (isEmail && !emailAnalysisInProgress) {
                console.log("Detected email content, analyzing for scheduling...");
                // Set flag before starting analysis to prevent duplicates
                setEmailAnalysisInProgress(true);
                
                // Use Groq to analyze the email and detect scheduling intent
                try {
                    await analyzeEmailForScheduling(cleanedText);
                } catch (error) {
                    console.error("Error during email analysis:", error);
                    setEmailAnalysisInProgress(false); // Reset flag on error
                }
            } else if (isEmail) {
                console.log("Email detected but analysis already in progress, skipping duplicate analysis");
                setInfoSnack({
                    open: true,
                    message: "Email content captured. Analysis already in progress."
                });
            } else {
                // For non-email captures, directly add the content to the chat context
                // and show snackbar notification
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
            text: "👋 Welcome! I'm your AI assistant. I can help you with various tasks like solving SQL queries.", 
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

    // Add user message
    setMessages(prev => [...prev, { text: message, sender: 'user' }]);
    const userMessage = message;
    setMessage('');
    setIsLoading(true);

    // Check if this is a response to a rescheduling request
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.sender === 'ai' && lastMessage.rescheduling) {
      try {
        // This is a response to a rescheduling request
        const reschedulingInfo = lastMessage.rescheduling;
        
        // Generate an email draft for rescheduling
        const emailDraft = `
Subject: Rescheduling Meeting - ${reschedulingInfo.purpose || 'Discussion'}

Hello,

Thank you for proposing a meeting on ${reschedulingInfo.originalDate} at ${reschedulingInfo.originalTime}.

Unfortunately, I'm not available at that time. I would like to propose rescheduling to ${userMessage}.

Please let me know if this alternative time works for you.

Best regards,
[Your Name]
        `;
        
        // Add the email draft as AI response
        setMessages(prev => [...prev, {
          text: `Here's a draft email you can send to reschedule the meeting:

${emailDraft}

Would you like me to adjust anything in this draft?`,
          sender: 'ai'
        }]);
        
        setIsLoading(false);
        return;
      } catch (error) {
        console.error("Error handling rescheduling:", error);
        // Continue with normal message handling if rescheduling fails
      }
    }

    // First check if this is a calendar scheduling request using the LLM
    const containsDateOrTime = /(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|next month|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}(st|nd|rd|th)?|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}:\d{2}|\d{1,2}\s*(am|pm)|noon|midnight)/i.test(userMessage);

    if (containsDateOrTime) {
      try {
        const apiKey = process.env.REACT_APP_GROQ_API_KEY;
        if (!apiKey) {
          throw new Error('Groq API key is not configured.');
        }
        
        // Create system message for context detection
        const systemPrompt = `
        Analyze the following user message to determine its intent.
        Return a JSON object with the following structure:
        {
          "intent": "schedule_meeting" | "draft_email" | "other",
          "confidence": 0-1 (how confident you are in your classification),
          "reason": "brief explanation of why you classified it this way"
        }
        
        "schedule_meeting" - if the user wants to directly create a calendar event or meeting
        "draft_email" - if the user wants to compose/draft an email about a meeting (not directly schedule it)
        "other" - if the message has another intent that doesn't involve scheduling or email drafting
        
        Only return valid JSON. Do not include any other text in your response.
        `;
        
        // Make API call for context detection
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
              { role: 'user', content: userMessage }
            ],
            temperature: 0.2,
            max_tokens: 128
          })
        });
        
        if (!response.ok) {
          throw new Error('Failed to analyze message context');
        }
        
        const data = await response.json();
        
        if (data.choices && data.choices.length > 0) {
          try {
            // Parse the JSON response
            const contextResult = JSON.parse(data.choices[0].message.content);
            const intent = contextResult.intent;
            const isConfident = contextResult.confidence > 0.7;
            
            if (intent === "draft_email" && isConfident) {
              // Handle drafting an email
              setMessages(prev => [...prev, { 
                text: `I'll help you draft an email for the meeting. Here's a suggested draft based on your request:

To: [Recipient]
Subject: Meeting on [Date mentioned in your message]

Dear [Recipient],

I hope this message finds you well. I'd like to schedule a meeting to discuss [topic] on [date and time from your message].

Please let me know if this time works for you, or if you'd prefer an alternative date/time.

Best regards,
[Your name]`,
                sender: 'ai' 
              }]);
              setIsLoading(false);
              return;
            } else if (intent === "schedule_meeting" && isConfident) {
              // Continue with the existing scheduling logic
              
              // This is our old scheduling logic
              if (!isCalendarAvailable) {
                // User needs to authenticate with Google Calendar first
                setMessages(prev => [...prev, { 
                  text: "I'd like to help you schedule that, but you need to connect to Google Calendar first. Would you like to connect now?", 
                  sender: 'ai' 
                }]);
                
                // Show authenticate option
                setSuggestedQueries(["Yes, connect to Google Calendar"]);
                setIsLoading(false);
                return;
              } else {
                // Extract event details directly from the user message
                try {
                  // Extract event details directly from the user message
                  let eventDetails = {
                    title: null,
                    description: "",
                    startDate: null,
                    startTime: null,
                    duration: 60, // Default duration (minutes)
                    attendees: []
                  };
                  
                  // Use existing extraction code
                  // Extract title - look for common patterns
                  const titleMatch = userMessage.match(/titled\s*["']([^"']+)["']|["']([^"']+)["']|meeting with\s+([a-zA-Z0-9 ]+)/i);
                  if (titleMatch) {
                    eventDetails.title = titleMatch[1] || titleMatch[2] || titleMatch[3];
                  } else {
                    // Try to extract a possible meeting subject
                    const meetingMatch = userMessage.match(/schedule (?:a|an) ([a-zA-Z0-9 ]+) (?:on|at|for|with)/i);
                    if (meetingMatch) {
                      eventDetails.title = meetingMatch[1];
                    } else {
                      eventDetails.title = "Meeting";  // Default title
                    }
                  }
                  
                  // Continue with existing date/time extraction code...
                  // Extract date - try various formats
                  const datePatterns = [
                    // MM/DD/YYYY or DD/MM/YYYY or YYYY/MM/DD
                    {
                      regex: /(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/i,
                      handler: (match) => {
                        let year = parseInt(match[3], 10);
                        // If year is 2 digits, assume 2000s
                        if (year < 100) year += 2000;
                        
                        // Assume MM/DD/YYYY format (common in US)
                        let month = parseInt(match[1], 10);
                        let day = parseInt(match[2], 10);
                        
                        // Validate month and day
                        if (month > 12) {
                          // Likely DD/MM/YYYY format
                          [month, day] = [day, month];
                        }
                        
                        return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                      }
                    },
                    // YYYY/MM/DD
                    {
                      regex: /(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/i,
                      handler: (match) => {
                        const year = parseInt(match[1], 10);
                        const month = parseInt(match[2], 10);
                        const day = parseInt(match[3], 10);
                        return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                      }
                    },
                    // Month name formats (27 March 2025, March 27 2025, etc.)
                    {
                      regex: /(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})|((january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4}))/i,
                      handler: (match) => {
                        const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
                        let day, month, year;
                        
                        if (match[1]) {
                          // Format: 27 March 2025
                          day = parseInt(match[1], 10);
                          month = months.findIndex(m => m.toLowerCase() === match[2].toLowerCase()) + 1;
                          year = parseInt(match[3], 10);
                        } else {
                          // Format: March 27, 2025
                          month = months.findIndex(m => m.toLowerCase() === match[4].toLowerCase()) + 1;
                          day = parseInt(match[6], 10);
                          year = parseInt(match[7], 10);
                        }
                        
                        return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                      }
                    },
                    // Relative dates (today, tomorrow, next Monday, etc.)
                    {
                      regex: /(today|tomorrow|next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(monday|tuesday|wednesday|thursday|friday|saturday|sunday))/i,
                      handler: (match) => {
                        const today = new Date();
                        const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
                        let resultDate = new Date(today);
                        
                        if (match[0].toLowerCase() === 'today') {
                          // Today - use as is
                        } else if (match[0].toLowerCase() === 'tomorrow') {
                          resultDate.setDate(today.getDate() + 1);
                        } else {
                          // Handle day names
                          let dayName;
                          if (match[2]) {
                            // "next Monday"
                            dayName = match[2].toLowerCase();
                          } else if (match[3]) {
                            // just "Monday"
                            dayName = match[3].toLowerCase();
                          }
                          
                          const targetDay = days.indexOf(dayName);
                          if (targetDay !== -1) {
                            const currentDay = today.getDay();
                            let daysToAdd;
                            
                            if (match[0].toLowerCase().includes('next')) {
                              // "next Monday" - find the day after a week
                              daysToAdd = 7 + (targetDay - currentDay);
                              if (daysToAdd > 7) daysToAdd -= 7;
                            } else {
                              // just "Monday" - find the upcoming day
                              daysToAdd = targetDay - currentDay;
                              if (daysToAdd <= 0) daysToAdd += 7; // If day already passed, go to next week
                            }
                            
                            resultDate.setDate(today.getDate() + daysToAdd);
                          }
                        }
                        
                        const year = resultDate.getFullYear();
                        const month = (resultDate.getMonth() + 1).toString().padStart(2, '0');
                        const day = resultDate.getDate().toString().padStart(2, '0');
                        
                        return `${year}-${month}-${day}`;
                      }
                    }
                  ];
                  
                  // Try each date pattern until we find a match
                  for (const pattern of datePatterns) {
                    const match = userMessage.match(pattern.regex);
                    if (match) {
                      eventDetails.startDate = pattern.handler(match);
                      if (eventDetails.startDate) break;
                    }
                  }
                  
                  // If no date was extracted, default to tomorrow
                  if (!eventDetails.startDate) {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    const year = tomorrow.getFullYear();
                    const month = (tomorrow.getMonth() + 1).toString().padStart(2, '0');
                    const day = tomorrow.getDate().toString().padStart(2, '0');
                    eventDetails.startDate = `${year}-${month}-${day}`;
                  }
                  
                  // Extract time - try various formats
                  const timeMatch = userMessage.match(/(\d{1,2}):(\d{2})(?:\s*(am|pm))?|(\d{1,2})\s*(am|pm)|at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
                  if (timeMatch) {
                    let hours = 9, minutes = 0; // Default to 9:00am
                    
                    if (timeMatch[1] && timeMatch[2]) {
                      // Format: 3:30pm or 15:30
                      hours = parseInt(timeMatch[1], 10);
                      minutes = parseInt(timeMatch[2], 10);
                      
                      // Convert from 12h to 24h format if needed
                      if (timeMatch[3] && timeMatch[3].toLowerCase() === 'pm' && hours < 12) {
                        hours += 12;
                      } else if (timeMatch[3] && timeMatch[3].toLowerCase() === 'am' && hours === 12) {
                        hours = 0;
                      }
                    } else if (timeMatch[4] && timeMatch[5]) {
                      // Format: 3pm
                      hours = parseInt(timeMatch[4], 10);
                      minutes = 0;
                      
                      // Convert from 12h to 24h format if needed
                      if (timeMatch[5].toLowerCase() === 'pm' && hours < 12) {
                        hours += 12;
                      } else if (timeMatch[5].toLowerCase() === 'am' && hours === 12) {
                        hours = 0;
                      }
                    } else if (timeMatch[6]) {
                      // Format: at 3pm or at 3:30pm
                      hours = parseInt(timeMatch[6], 10);
                      minutes = timeMatch[7] ? parseInt(timeMatch[7], 10) : 0;
                      
                      // Convert from 12h to 24h format if needed
                      if (timeMatch[8] && timeMatch[8].toLowerCase() === 'pm' && hours < 12) {
                        hours += 12;
                      } else if (timeMatch[8] && timeMatch[8].toLowerCase() === 'am' && hours === 12) {
                        hours = 0;
                      }
                    }
                    
                    // Format the time string
                    eventDetails.startTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                  } else {
                    // Default to 9:00 AM
                    eventDetails.startTime = "09:00";
                  }
                  
                  // Extract duration
                  const durationMatch = userMessage.match(/for\s+(\d+)\s+hour|for\s+(\d+)\s+hr|(\d+)\s+hour|(\d+)\s+hr|for\s+(\d+)\s+min|for\s+(\d+)\s+minute|(\d+)\s+min|(\d+)\s+minute/i);
                  if (durationMatch) {
                    const hourValue = parseInt(durationMatch[1] || durationMatch[2] || durationMatch[3] || durationMatch[4] || 0, 10);
                    const minuteValue = parseInt(durationMatch[5] || durationMatch[6] || durationMatch[7] || durationMatch[8] || 0, 10);
                    
                    if (hourValue > 0) {
                      eventDetails.duration = hourValue * 60;
                    } else if (minuteValue > 0) {
                      eventDetails.duration = minuteValue;
                    }
                  }
                  
                  // Create the event
                  if (eventDetails.title && eventDetails.startDate && eventDetails.startTime) {
                    await handleCreateCalendarEvent(eventDetails);
                    return;
                  } else {
                    throw new Error("Could not extract complete event details");
                  }
                } catch (error) {
                  console.error("Error handling calendar event:", error);
                  // Show error message
                  setMessages(prev => [...prev, { 
                    text: `I'm sorry, but I couldn't schedule your event. Error: ${error.message}. Please try again with a format like "schedule a meeting with John on March 27, 2025 at 1pm for 2 hours"`, 
                    sender: 'ai' 
                  }]);
                  setIsLoading(false);
                  return;
                }
              }
            }
          } catch (error) {
            console.error("Error parsing context detection result:", error);
          }
        }
      } catch (error) {
        console.error("Error detecting scheduling intent:", error);
        // Continue with normal message handling if context detection fails
      }
    }

    // If we got here, we're handling a regular message (not scheduling)
    await sendToGroq([...messages, { text: userMessage, sender: 'user' }]);
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

  // Modified scheduleMeeting function with participant email validation
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
      
      // Parse the date string into a proper Date object
      let meetingDate;
      let meetingTime;
      
      // Handle different date formats
      // 1. Check for month name format (e.g., "24 April 2025" or "April 24, 2025")
      const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
      const monthPattern = new RegExp(`(\\d{1,2})\\s+(${monthNames.join('|')})\\s+(\\d{4})|((${monthNames.join('|')})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4}))`, 'i');
      
      const monthMatch = meetingDetails.date.match(monthPattern);
      if (monthMatch) {
        let day, month, year;
        
        if (monthMatch[1]) {
          // Format: 24 April 2025
          day = parseInt(monthMatch[1], 10);
          const monthName = monthMatch[2].toLowerCase();
          month = monthNames.indexOf(monthName) + 1;
          year = parseInt(monthMatch[3], 10);
        } else {
          // Format: April 24, 2025
          const monthName = monthMatch[4].toLowerCase();
          month = monthNames.indexOf(monthName) + 1;
          day = parseInt(monthMatch[6], 10);
          year = parseInt(monthMatch[7], 10);
        }
        
        // Validate parsed values
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2000) {
          // Store as ISO format (YYYY-MM-DD)
          meetingDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
          console.log("Parsed month name format to:", meetingDate);
        } else {
          console.log("Invalid date values from month pattern:", day, month, year);
          meetingDate = meetingDetails.date;
        }
      } else if (meetingDetails.date.includes("/")) {
        // Handle MM/DD/YYYY format
        const parts = meetingDetails.date.split("/");
        if (parts.length === 3) {
          // Try to guess if it's MM/DD/YYYY or DD/MM/YYYY
          let month, day, year;
          
          if (parseInt(parts[0], 10) > 12) {
            // First part is likely the day
            day = parseInt(parts[0], 10);
            month = parseInt(parts[1], 10);
          } else {
            // First part is likely the month
            month = parseInt(parts[0], 10);
            day = parseInt(parts[1], 10);
          }
          
          year = parts[2];
          // If year is 2 digits, assume it's 2000s
          if (year.length === 2) year = "20" + year;
          year = parseInt(year, 10);
          
          // Validate parsed values
          if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2000) {
            meetingDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
            console.log("Parsed slash format to:", meetingDate);
          } else {
            console.log("Invalid date values from slash pattern:", day, month, year);
            meetingDate = meetingDetails.date;
          }
        } else {
          meetingDate = meetingDetails.date;
        }
      } else if (meetingDetails.date.includes("-")) {
        // Handle YYYY-MM-DD or DD-MM-YYYY format
        const parts = meetingDetails.date.split("-");
        if (parts.length === 3) {
          let day, month, year;
          
          // Check if first part is 4 digits (year)
          if (parts[0].length === 4) {
            // YYYY-MM-DD format
            year = parseInt(parts[0], 10);
            month = parseInt(parts[1], 10);
            day = parseInt(parts[2], 10);
            
            // Already in ISO format, but validate
            if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2000) {
              meetingDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
              console.log("Parsed ISO format to:", meetingDate);
            } else {
              console.log("Invalid date values from ISO pattern:", day, month, year);
              meetingDate = meetingDetails.date;
            }
          } else {
            // Likely DD-MM-YYYY
            day = parseInt(parts[0], 10);
            month = parseInt(parts[1], 10);
            year = parseInt(parts[2], 10);
            
            // Validate parsed values
            if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2000) {
              meetingDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
              console.log("Parsed dash format to:", meetingDate);
            } else {
              console.log("Invalid date values from dash pattern:", day, month, year);
              meetingDate = meetingDetails.date;
            }
          }
        } else {
          meetingDate = meetingDetails.date;
        }
      } else if (meetingDetails.date === "not specified") {
        // Default to tomorrow if date not specified
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        meetingDate = tomorrow.toISOString().split('T')[0];
        console.log("Using default tomorrow date:", meetingDate);
      } else {
        // Try to parse using built-in Date
        try {
          const dateObj = new Date(meetingDetails.date);
          if (!isNaN(dateObj.getTime())) {
            const year = dateObj.getFullYear();
            const month = dateObj.getMonth() + 1;
            const day = dateObj.getDate();
            meetingDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
            console.log("Parsed using Date constructor:", meetingDate);
          } else {
            console.log("Date constructor failed, using original:", meetingDetails.date);
            meetingDate = meetingDetails.date;
          }
        } catch (e) {
          console.error("Error with Date constructor:", e);
          meetingDate = meetingDetails.date;
        }
      }
      
      // Handle time format with robust handling for all formats
      // 1. First check for simple format like "2 PM" or "2 pm"
      const simpleTimeMatch = meetingDetails.time.match(/^\s*(\d{1,2})\s*([ap]m)\s*$/i);
      if (simpleTimeMatch) {
        let hours = parseInt(simpleTimeMatch[1], 10);
        const period = simpleTimeMatch[2].toLowerCase();
        
        // Convert to 24-hour format
        if (period === 'pm' && hours < 12) {
          hours += 12;
        } else if (period === 'am' && hours === 12) {
          hours = 0;
        }
        
        meetingTime = `${hours.toString().padStart(2, '0')}:00`;
        console.log("Parsed simple time format to:", meetingTime);
      }
      // 2. Check for format with minutes like "2:30 PM" or "14:30"
      else if (meetingDetails.time.match(/^\s*(\d{1,2}):(\d{2})\s*([ap]m)?\s*$/i)) {
        const timeParts = meetingDetails.time.match(/^\s*(\d{1,2}):(\d{2})\s*([ap]m)?\s*$/i);
        let hours = parseInt(timeParts[1], 10);
        const minutes = parseInt(timeParts[2], 10);
        const period = timeParts[3] ? timeParts[3].toLowerCase() : null;
        
        // Convert to 24-hour format if period is specified
        if (period === 'pm' && hours < 12) {
          hours += 12;
        } else if (period === 'am' && hours === 12) {
          hours = 0;
        }
        
        meetingTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        console.log("Parsed time with minutes to:", meetingTime);
      }
      // 3. Check for single hour number, like "2"
      else if (meetingDetails.time.match(/^\s*(\d{1,2})\s*$/)) {
        const hour = parseInt(meetingDetails.time.match(/^\s*(\d{1,2})\s*$/)[1], 10);
        // Default assumption: hour in the range 0-23
        meetingTime = `${hour.toString().padStart(2, '0')}:00`;
        console.log("Parsed single hour to:", meetingTime);
      }
      else if (meetingDetails.time === "not specified") {
        // Default to 9:00 AM if time not specified
        meetingTime = "09:00";
        console.log("Using default time 09:00");
      }
      else {
        // Just use the original time string
        console.log("No standard pattern matched for time, using original:", meetingDetails.time);
        meetingTime = meetingDetails.time;
      }
      
      console.log("Final parsed date and time:", meetingDate, meetingTime);
      
      // Ensure we have a valid date-time string
      try {
        let testDate = null;
        
        // Try multiple construction methods for maximum compatibility
        // Method 1: ISO format
        try {
          console.log(`Attempting ISO format: ${meetingDate}T${meetingTime}`);
          testDate = new Date(`${meetingDate}T${meetingTime}`);
          if (!isNaN(testDate.getTime())) {
            console.log("ISO format succeeded");
          }
        } catch (e) {
          console.error("ISO format error:", e);
        }
        
        // Method 2: Space-separated format
        if (!testDate || isNaN(testDate.getTime())) {
          try {
            console.log(`Attempting space format: ${meetingDate} ${meetingTime}`);
            testDate = new Date(`${meetingDate} ${meetingTime}`);
            if (!isNaN(testDate.getTime())) {
              console.log("Space format succeeded");
            }
          } catch (e) {
            console.error("Space format error:", e);
          }
        }
        
        // Method 3: Direct component construction
        if (!testDate || isNaN(testDate.getTime())) {
          try {
            const [year, month, day] = meetingDate.split('-').map(Number);
            const [hours, minutes] = meetingTime.split(':').map(Number);
            
            console.log("Attempting direct construction:", year, month-1, day, hours, minutes);
            testDate = new Date(year, month - 1, day, hours, minutes);
            
            // Verify the date is valid by checking the component values
            const isValid = (
              testDate.getFullYear() === year && 
              testDate.getMonth() === month - 1 && 
              testDate.getDate() === day && 
              testDate.getHours() === hours && 
              testDate.getMinutes() === minutes
            );
            
            if (isValid) {
              console.log("Direct construction succeeded");
            } else {
              console.warn("Direct construction created invalid date, will try another method");
              testDate = null;
            }
          } catch (e) {
            console.error("Direct construction error:", e);
          }
        }
        
        // Method 4: Manual ISO string construction
        if (!testDate || isNaN(testDate.getTime())) {
          try {
            const [year, month, day] = meetingDate.split('-').map(Number);
            const [hours, minutes] = meetingTime.split(':').map(Number);
            
            const isoString = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
            console.log("Attempting ISO string construction:", isoString);
            testDate = new Date(isoString);
            
            if (!isNaN(testDate.getTime())) {
              console.log("ISO string construction succeeded");
            } else {
              console.warn("ISO string construction failed");
            }
          } catch (e) {
            console.error("ISO string construction error:", e);
          }
        }
        
        // Final fallback: try parsing the raw date and time inputs
        if (!testDate || isNaN(testDate.getTime())) {
          try {
            console.log("Attempting to parse raw inputs:", meetingDetails.date, meetingDetails.time);
            const combinedString = `${meetingDetails.date} ${meetingDetails.time}`;
            testDate = new Date(combinedString);
            
            if (!isNaN(testDate.getTime())) {
              console.log("Raw input parsing succeeded");
            } else {
              console.warn("All parsing methods failed");
            }
          } catch (e) {
            console.error("Raw input parsing error:", e);
          }
        }
        
        if (!testDate || isNaN(testDate.getTime())) {
          throw new Error(`Could not create a valid date from: ${meetingDate} ${meetingTime}`);
        }
        
        console.log("Final date object:", testDate, "ISO string:", testDate.toISOString());
        
        const startDateTime = testDate;
        const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000); // 1 hour
        
        const eventData = calendarService.formatEvent(
          `Meeting: ${meetingDetails.purpose || 'Discussion'}`,
          `Meeting ${meetingDetails.purpose ? `about ${meetingDetails.purpose}` : ''} on ${meetingDetails.date} at ${meetingDetails.time}`,
          startDateTime,
          endDateTime,
          validParticipants // Use validated participants
        );

        await calendarService.createEvent("primary", eventData);
        showSnackbar("Meeting scheduled successfully!", "success");
      } catch (error) {
        console.error("Date parsing error:", error);
        throw new Error(`Failed to create calendar event: ${error.message}`);
      }
    } catch (error) {
      console.error("Error scheduling meeting:", error);
      showSnackbar(`Failed to schedule meeting: ${error.message}`, "error");
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
    </Box>
  );
}

export default ChatInterface; 