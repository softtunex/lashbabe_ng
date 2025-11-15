import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  Card, 
  CardContent,
  Grid,
  GridItem,
  Flex,
  Loader,
  ProgressBar
} from '@strapi/design-system';
import { User, Clock, CheckCircle, XCircle } from '@strapi/icons';
import { useFetchClient } from '@strapi/helper-plugin';
import { format, startOfDay, endOfDay } from 'date-fns';

const QuickStats = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalServices: 0,
    activeServices: 0,
    totalCustomers: 0,
    todayBookings: 0,
    weeklyBookings: 0,
    completionRate: 0,
    noShowRate: 0,
    totalGalleryImages: 0
  });
  
  const { get } = useFetchClient();

  useEffect(() => {
    fetchStats();
    // Refresh every 15 minutes
    const interval = setInterval(fetchStats, 900000);
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      
      const today = format(new Date(), 'yyyy-MM-dd');
      const weekAgo = format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
      
      // Fetch all required data
      const [
        servicesData,
        todayAppointments,
        weekAppointments,
        galleryData,
        completedAppointments,
        noShowAppointments
      ] = await Promise.all([
        // Total services
        get('/api/services?pagination[pageSize]=100'),
        // Today's appointments
        get(`/api/appointments?filters[appointment_date][$eq]=${today}`),
        // This week's appointments
        get(`/api/appointments?filters[appointment_date][$gte]=${weekAgo}`),
        // Gallery images
        get('/api/galleries?pagination[pageSize]=1'),
        // Completed appointments this month
        get(`/api/appointments?filters[status][$eq]=completed&filters[appointment_date][$gte]=${format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd')}`),
        // No-show appointments this month
        get(`/api/appointments?filters[status][$eq]=no-show&filters[appointment_date][$gte]=${format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd')}`)
      ]);
      
      // Calculate unique customers from appointments
      const allAppointments = weekAppointments?.data || [];
      const uniqueCustomers = new Set(allAppointments.map(apt => apt.attributes.customer_email));
      
      // Calculate completion and no-show rates
      const totalCompleted = completedAppointments?.data?.length || 0;
      const totalNoShow = noShowAppointments?.data?.length || 0;
      const totalFinished = totalCompleted + totalNoShow;
      
      setStats({
        totalServices: servicesData?.data?.length || 0,
        activeServices: servicesData?.data?.filter(s => s.attributes.is_active).length || 0,
        totalCustomers: uniqueCustomers.size,
        todayBookings: todayAppointments?.data?.length || 0,
        weeklyBookings: weekAppointments?.data?.length || 0,
        completionRate: totalFinished > 0 ? Math.round((totalCompleted / totalFinished) * 100) : 0,
        noShowRate: totalFinished > 0 ? Math.round((totalNoShow / totalFinished) * 100) : 0,
        totalGalleryImages: galleryData?.meta?.pagination?.total || 0
      });
      
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Box padding={4} background="neutral0">
            <Flex justifyContent="center">
              <Loader>Loading statistics...</Loader>
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
          <Typography variant="alpha" marginBottom={4}>
            Quick Overview
          </Typography>

          <Grid gap={4}>
            {/* Services Stats */}
            <GridItem col={4}>
              <Card>
                <Box padding={3} background="neutral0">
                  <Typography variant="sigma" textColor="neutral600" marginBottom={2}>
                    SERVICES
                  </Typography>
                  <Flex justifyContent="space-between" alignItems="flex-end">
                    <Box>
                      <Typography variant="alpha" fontWeight="bold">
                        {stats.activeServices}
                      </Typography>
                      <Typography variant="pi" textColor="neutral600">
                        Active
                      </Typography>
                    </Box>
                    <Typography variant="delta" textColor="neutral500">
                      / {stats.totalServices} total
                    </Typography>
                  </Flex>
                </Box>
              </Card>
            </GridItem>

            {/* Customer Stats */}
            <GridItem col={4}>
              <Card>
                <Box padding={3} background="neutral0">
                  <Typography variant="sigma" textColor="neutral600" marginBottom={2}>
                    CUSTOMERS THIS WEEK
                  </Typography>
                  <Flex alignItems="center" gap={2}>
                    <User />
                    <Typography variant="alpha" fontWeight="bold">
                      {stats.totalCustomers}
                    </Typography>
                  </Flex>
                  <Typography variant="pi" textColor="neutral600">
                    Unique customers
                  </Typography>
                </Box>
              </Card>
            </GridItem>

            {/* Bookings Stats */}
            <GridItem col={4}>
              <Card>
                <Box padding={3} background="neutral0">
                  <Typography variant="sigma" textColor="neutral600" marginBottom={2}>
                    BOOKINGS
                  </Typography>
                  <Flex justifyContent="space-between">
                    <Box>
                      <Typography variant="delta" fontWeight="bold">
                        {stats.todayBookings}
                      </Typography>
                      <Typography variant="pi" textColor="neutral600">
                        Today
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="delta" fontWeight="bold">
                        {stats.weeklyBookings}
                      </Typography>
                      <Typography variant="pi" textColor="neutral600">
                        This Week
                      </Typography>
                    </Box>
                  </Flex>
                </Box>
              </Card>
            </GridItem>

            {/* Completion Rate */}
            <GridItem col={6}>
              <Card>
                <Box padding={3} background="neutral0">
                  <Flex justifyContent="space-between" marginBottom={2}>
                    <Typography variant="sigma" textColor="success600">
                      <CheckCircle /> COMPLETION RATE
                    </Typography>
                    <Typography variant="delta" fontWeight="bold" textColor="success600">
                      {stats.completionRate}%
                    </Typography>
                  </Flex>
                  <ProgressBar value={stats.completionRate} size="M">
                    {stats.completionRate}% completed
                  </ProgressBar>
                  <Typography variant="pi" textColor="neutral600" marginTop={1}>
                    Appointments completed this month
                  </Typography>
                </Box>
              </Card>
            </GridItem>

            {/* No-Show Rate */}
            <GridItem col={6}>
              <Card>
                <Box padding={3} background="neutral0">
                  <Flex justifyContent="space-between" marginBottom={2}>
                    <Typography variant="sigma" textColor="danger600">
                      <XCircle /> NO-SHOW RATE
                    </Typography>
                    <Typography variant="delta" fontWeight="bold" textColor="danger600">
                      {stats.noShowRate}%
                    </Typography>
                  </Flex>
                  <ProgressBar value={stats.noShowRate} size="M">
                    {stats.noShowRate}% no-shows
                  </ProgressBar>
                  <Typography variant="pi" textColor="neutral600" marginTop={1}>
                    Missed appointments this month
                  </Typography>
                </Box>
              </Card>
            </GridItem>

            {/* Gallery Stats */}
            <GridItem col={12}>
              <Card>
                <Box padding={3} background="primary100">
                  <Flex justifyContent="space-between" alignItems="center">
                    <Box>
                      <Typography variant="sigma" textColor="primary700">
                        PORTFOLIO GALLERY
                      </Typography>
                      <Typography variant="pi" textColor="primary600" marginTop={1}>
                        Showcase your amazing work
                      </Typography>
                    </Box>
                    <Box textAlign="right">
                      <Typography variant="alpha" fontWeight="bold" textColor="primary700">
                        {stats.totalGalleryImages}
                      </Typography>
                      <Typography variant="pi" textColor="primary600">
                        Images uploaded
                      </Typography>
                    </Box>
                  </Flex>
                </Box>
              </Card>
            </GridItem>
          </Grid>
        </Box>
      </CardContent>
    </Card>
  );
};

export default QuickStats;
