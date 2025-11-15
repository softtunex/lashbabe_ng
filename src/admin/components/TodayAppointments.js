import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  Card, 
  CardContent,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  Flex,
  IconButton,
  Loader
} from '@strapi/design-system';
import { Eye, Calendar } from '@strapi/icons';
import { useFetchClient } from '@strapi/helper-plugin';
import { format } from 'date-fns';

const TodayAppointments = () => {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    confirmed: 0,
    pending: 0,
    completed: 0
  });
  
  const { get } = useFetchClient();

  useEffect(() => {
    fetchTodayAppointments();
    // Refresh every 5 minutes
    const interval = setInterval(fetchTodayAppointments, 300000);
    return () => clearInterval(interval);
  }, []);

  const fetchTodayAppointments = async () => {
    try {
      setLoading(true);
      const today = format(new Date(), 'yyyy-MM-dd');
      
      // Fetch today's appointments
      const { data } = await get(`/api/appointments?filters[appointment_date][$eq]=${today}&populate=service&sort=appointment_time:asc`);
      
      setAppointments(data?.data || []);
      
      // Calculate stats
      const appointments = data?.data || [];
      setStats({
        total: appointments.length,
        confirmed: appointments.filter(a => a.attributes.status === 'confirmed').length,
        pending: appointments.filter(a => a.attributes.status === 'pending').length,
        completed: appointments.filter(a => a.attributes.status === 'completed').length,
      });
      
    } catch (error) {
      console.error('Error fetching appointments:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: 'warning',
      confirmed: 'success',
      completed: 'neutral',
      cancelled: 'danger',
      'no-show': 'danger'
    };
    return colors[status] || 'neutral';
  };

  const formatTime = (time) => {
    if (!time) return '';
    return format(new Date(`2000-01-01T${time}`), 'h:mm a');
  };

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Box padding={4} background="neutral0">
            <Flex justifyContent="center">
              <Loader>Loading today's appointments...</Loader>
            </Flex>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Box padding={4} background="neutral0">
          <Flex justifyContent="space-between" alignItems="center" marginBottom={4}>
            <Typography variant="alpha">
              <Calendar /> Today's Appointments
            </Typography>
            <Typography variant="pi" textColor="neutral600">
              {format(new Date(), 'EEEE, MMMM d, yyyy')}
            </Typography>
          </Flex>

          {/* Stats Cards */}
          <Flex gap={4} marginBottom={4}>
            <Card>
              <Box padding={3} background="primary100">
                <Typography variant="sigma" textColor="primary700">TOTAL</Typography>
                <Typography variant="alpha" textColor="primary700">{stats.total}</Typography>
              </Box>
            </Card>
            <Card>
              <Box padding={3} background="success100">
                <Typography variant="sigma" textColor="success700">CONFIRMED</Typography>
                <Typography variant="alpha" textColor="success700">{stats.confirmed}</Typography>
              </Box>
            </Card>
            <Card>
              <Box padding={3} background="warning100">
                <Typography variant="sigma" textColor="warning700">PENDING</Typography>
                <Typography variant="alpha" textColor="warning700">{stats.pending}</Typography>
              </Box>
            </Card>
            <Card>
              <Box padding={3} background="neutral100">
                <Typography variant="sigma" textColor="neutral700">COMPLETED</Typography>
                <Typography variant="alpha" textColor="neutral700">{stats.completed}</Typography>
              </Box>
            </Card>
          </Flex>

          {/* Appointments Table */}
          {appointments.length > 0 ? (
            <Table colCount={6} rowCount={appointments.length}>
              <Thead>
                <Tr>
                  <Th>Time</Th>
                  <Th>Customer</Th>
                  <Th>Service</Th>
                  <Th>Phone</Th>
                  <Th>Status</Th>
                  <Th>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {appointments.map((appointment) => (
                  <Tr key={appointment.id}>
                    <Td>
                      <Typography fontWeight="bold">
                        {formatTime(appointment.attributes.appointment_time)}
                      </Typography>
                    </Td>
                    <Td>{appointment.attributes.customer_name}</Td>
                    <Td>
                      {appointment.attributes.service?.data?.attributes?.name || 'N/A'}
                    </Td>
                    <Td>{appointment.attributes.customer_phone}</Td>
                    <Td>
                      <Badge active={appointment.attributes.status === 'confirmed'} 
                             textColor={`${getStatusColor(appointment.attributes.status)}600`}
                             backgroundColor={`${getStatusColor(appointment.attributes.status)}100`}>
                        {appointment.attributes.status}
                      </Badge>
                    </Td>
                    <Td>
                      <IconButton 
                        onClick={() => window.location.href = `/admin/content-manager/collectionType/api::appointment.appointment/${appointment.id}`}
                        label="View details"
                        icon={<Eye />}
                      />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          ) : (
            <Box padding={4} background="neutral100" hasRadius>
              <Typography textAlign="center" textColor="neutral600">
                No appointments scheduled for today
              </Typography>
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default TodayAppointments;
