import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Paper,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  Grid,
  Divider,
  Snackbar,
  Alert
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, Event as EventIcon, Logout as LogoutIcon, ArrowBack } from '@mui/icons-material';
import { LocalizationProvider, DateTimePicker } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs from 'dayjs';
import calendarService from '../utils/calendarService';

const CalendarView = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openEventDialog, setOpenEventDialog] = useState(false);
  const [eventForm, setEventForm] = useState({
    title: '',
    description: '',
    start: dayjs(),
    end: dayjs().add(1, 'hour'), // Default 1 hour later
    attendees: ''
  });
  const [currentEvent, setCurrentEvent] = useState(null);
  const [openSnackbar, setOpenSnackbar] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('success');
  const [userInfo, setUserInfo] = useState({ name: '', email: '' });

  // Format date for display
  const formatDate = (dateString) => {
    const options = { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  // Check if user is authenticated
  useEffect(() => {
    if (!calendarService.isAuthenticated()) {
      navigate('/');
      return;
    }

    setUserInfo(calendarService.getUserInfo());
    loadEvents();
  }, [navigate]);

  // Load events from Google Calendar
  const loadEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await calendarService.listEvents('primary', new Date().toISOString(), 20);
      setEvents(result.items || []);
    } catch (err) {
      console.error('Failed to load events:', err);
      setError('Failed to load events. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem('google_access_token');
    localStorage.removeItem('google_refresh_token');
    localStorage.removeItem('google_token_expiry');
    localStorage.removeItem('google_user_email');
    localStorage.removeItem('google_user_name');
    navigate('/');
  };

  // Open dialog to create/edit event
  const openCreateEventDialog = () => {
    setCurrentEvent(null);
    setEventForm({
      title: '',
      description: '',
      start: dayjs(),
      end: dayjs().add(1, 'hour'),
      attendees: ''
    });
    setOpenEventDialog(true);
  };

  // Open dialog to edit existing event
  const openEditEventDialog = async (eventId) => {
    try {
      setLoading(true);
      const event = await calendarService.getEvent('primary', eventId);
      setCurrentEvent(event);
      
      setEventForm({
        title: event.summary || '',
        description: event.description || '',
        start: dayjs(event.start.dateTime || event.start.date),
        end: dayjs(event.end.dateTime || event.end.date),
        attendees: event.attendees ? event.attendees.map(a => a.email).join(', ') : ''
      });
      
      setOpenEventDialog(true);
    } catch (err) {
      console.error('Failed to load event details:', err);
      showSnackbar('Failed to load event details', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Close dialog
  const handleCloseDialog = () => {
    setOpenEventDialog(false);
  };

  // Handle form input changes
  const handleFormChange = (field, value) => {
    setEventForm({
      ...eventForm,
      [field]: value
    });
  };

  // Create or update event
  const handleSaveEvent = async () => {
    try {
      setLoading(true);
      
      // Validate form
      if (!eventForm.title.trim()) {
        showSnackbar('Please enter a title for the event', 'error');
        setLoading(false);
        return;
      }
      
      if (eventForm.end.isBefore(eventForm.start)) {
        showSnackbar('End time cannot be before start time', 'error');
        setLoading(false);
        return;
      }
      
      // Parse attendees
      const attendeesList = eventForm.attendees
        ? eventForm.attendees.split(',').map(email => email.trim()).filter(email => email)
        : [];
      
      // Prepare event data
      const eventData = calendarService.formatEvent(
        eventForm.title,
        eventForm.description,
        eventForm.start.toDate(),
        eventForm.end.toDate(),
        attendeesList
      );
      
      // Create or update
      if (currentEvent) {
        await calendarService.updateEvent('primary', currentEvent.id, eventData);
        showSnackbar('Event updated successfully', 'success');
      } else {
        await calendarService.createEvent('primary', eventData);
        showSnackbar('Event created successfully', 'success');
      }
      
      // Reload events and close dialog
      loadEvents();
      handleCloseDialog();
    } catch (err) {
      console.error('Failed to save event:', err);
      showSnackbar('Failed to save event: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setLoading(false);
    }
  };

  // Delete event
  const handleDeleteEvent = async (eventId) => {
    try {
      if (!window.confirm('Are you sure you want to delete this event?')) {
        return;
      }
      
      setLoading(true);
      const result = await calendarService.deleteEvent('primary', eventId);
      if (result) {
        setEvents((prevEvents) => prevEvents.filter((event) => event.id !== eventId));
        showSnackbar('Event deleted successfully', 'success');
      }
    } catch (error) {
      console.error('Error deleting event:', error);
      showSnackbar(`Failed to delete event: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Show snackbar message
  const showSnackbar = (message, severity = 'info') => {
    setSnackbarMessage(message);
    setSnackbarSeverity(severity);
    setOpenSnackbar(true);
  };

  // Handle snackbar close
  const handleCloseSnackbar = () => {
    setOpenSnackbar(false);
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Button
            variant="outlined"
            startIcon={<ArrowBack />}
            onClick={() => navigate('/')}
            sx={{ mr: 2 }}
          >
            Back to Chat
          </Button>
          <Typography variant="h4" component="h1">
            <EventIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            Google Calendar Manager
          </Typography>
        </Box>
        
        <Box>
          {userInfo.email && (
            <Typography variant="body2" sx={{ mb: 1, textAlign: 'right' }}>
              Signed in as: {userInfo.name || userInfo.email}
            </Typography>
          )}
          
          <Button 
            variant="outlined" 
            color="error" 
            startIcon={<LogoutIcon />}
            onClick={handleLogout}
          >
            Sign Out
          </Button>
        </Box>
      </Box>
      
      {/* Main content */}
      <Grid container spacing={3}>
        {/* Events list */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2, mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">
                Your Calendar Events
              </Typography>
              
              <Button 
                variant="contained" 
                color="primary" 
                startIcon={<AddIcon />} 
                onClick={openCreateEventDialog}
              >
                Create Event
              </Button>
            </Box>
            
            <Divider sx={{ mb: 2 }} />
            
            {loading && <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
              <CircularProgress />
            </Box>}
            
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            
            {!loading && !error && events.length === 0 && (
              <Alert severity="info">
                No upcoming events found. Click 'Create Event' to add a new event to your calendar.
              </Alert>
            )}
            
            {!loading && !error && events.length > 0 && (
              <List>
                {events.map((event) => (
                  <Paper key={event.id} elevation={1} sx={{ mb: 2, p: 1 }}>
                    <ListItem
                      secondaryAction={
                        <Box>
                          <IconButton edge="end" onClick={() => openEditEventDialog(event.id)}>
                            <EditIcon />
                          </IconButton>
                          <IconButton edge="end" onClick={() => handleDeleteEvent(event.id)}>
                            <DeleteIcon />
                          </IconButton>
                        </Box>
                      }
                    >
                      <ListItemText
                        primary={event.summary}
                        secondary={
                          <>
                            <Typography component="span" variant="body2" color="text.primary">
                              {formatDate(event.start.dateTime || event.start.date)}
                              {' - '}
                              {formatDate(event.end.dateTime || event.end.date)}
                            </Typography>
                            {event.description && (
                              <Typography component="div" variant="body2" sx={{ mt: 1 }}>
                                {event.description}
                              </Typography>
                            )}
                          </>
                        }
                      />
                    </ListItem>
                  </Paper>
                ))}
              </List>
            )}
          </Paper>
        </Grid>
      </Grid>
      
      {/* Event Dialog */}
      <Dialog open={openEventDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{currentEvent ? 'Edit Event' : 'Create New Event'}</DialogTitle>
        <DialogContent>
          <Box component="form" sx={{ mt: 1 }}>
            <TextField
              label="Title"
              fullWidth
              margin="normal"
              value={eventForm.title}
              onChange={(e) => handleFormChange('title', e.target.value)}
              required
            />
            
            <TextField
              label="Description"
              fullWidth
              margin="normal"
              multiline
              rows={3}
              value={eventForm.description}
              onChange={(e) => handleFormChange('description', e.target.value)}
            />
            
            <LocalizationProvider dateAdapter={AdapterDayjs}>
              <Box sx={{ display: 'flex', gap: 2, mt: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
                <DateTimePicker
                  label="Start Time"
                  value={eventForm.start}
                  onChange={(newValue) => handleFormChange('start', newValue)}
                  slotProps={{ textField: { fullWidth: true } }}
                />
                
                <DateTimePicker
                  label="End Time"
                  value={eventForm.end}
                  onChange={(newValue) => handleFormChange('end', newValue)}
                  slotProps={{ textField: { fullWidth: true } }}
                />
              </Box>
            </LocalizationProvider>
            
            <TextField
              label="Attendees (comma-separated emails)"
              fullWidth
              margin="normal"
              value={eventForm.attendees}
              onChange={(e) => handleFormChange('attendees', e.target.value)}
              placeholder="email1@example.com, email2@example.com"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button 
            onClick={handleSaveEvent} 
            variant="contained" 
            color="primary"
            disabled={loading}
          >
            {loading ? <CircularProgress size={24} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Snackbar for notifications */}
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
    </Box>
  );
};

export default CalendarView; 