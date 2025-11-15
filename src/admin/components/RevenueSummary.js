import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  Card, 
  CardContent,
  Grid,
  GridItem,
  Flex,
  Loader
} from '@strapi/design-system';
import { CreditCard, TrendingUp, Calendar, DollarSign } from '@strapi/icons';
import { useFetchClient } from '@strapi/helper-plugin';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';

const RevenueSummary = () => {
  const [loading, setLoading] = useState(true);
  const [revenue, setRevenue] = useState({
    today: 0,
    week: 0,
    month: 0,
    pendingDeposits: 0
  });
  
  const { get } = useFetchClient();

  useEffect(() => {
    fetchRevenueData();
    // Refresh every 10 minutes
    const interval = setInterval(fetchRevenueData, 600000);
    return () => clearInterval(interval);
  }, []);

  const fetchRevenueData = async () => {
    try {
      setLoading(true);
      
      const now = new Date();
      const todayStart = format(startOfDay(now), 'yyyy-MM-dd');
      const todayEnd = format(endOfDay(now), 'yyyy-MM-dd');
      const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const weekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');
      
      // Fetch payments for different periods
      const [todayData, weekData, monthData, pendingData] = await Promise.all([
        // Today's payments
        get(`/api/payments?filters[payment_date][$gte]=${todayStart}&filters[payment_date][$lte]=${todayEnd}&filters[status][$eq]=success`),
        // This week's payments
        get(`/api/payments?filters[payment_date][$gte]=${weekStart}&filters[payment_date][$lte]=${weekEnd}&filters[status][$eq]=success`),
        // This month's payments
        get(`/api/payments?filters[payment_date][$gte]=${monthStart}&filters[payment_date][$lte]=${monthEnd}&filters[status][$eq]=success`),
        // Pending deposits
        get(`/api/payments?filters[status][$eq]=pending&filters[payment_type][$eq]=deposit`)
      ]);
      
      // Calculate totals
      const calculateTotal = (data) => {
        return (data?.data || []).reduce((sum, payment) => {
          return sum + (payment.attributes.amount || 0);
        }, 0);
      };
      
      setRevenue({
        today: calculateTotal(todayData),
        week: calculateTotal(weekData),
        month: calculateTotal(monthData),
        pendingDeposits: calculateTotal(pendingData)
      });
      
    } catch (error) {
      console.error('Error fetching revenue data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Box padding={4} background="neutral0">
            <Flex justifyContent="center">
              <Loader>Loading revenue data...</Loader>
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
              <DollarSign /> Revenue Summary
            </Typography>
          </Flex>

          <Grid gap={4}>
            <GridItem col={6}>
              <Card>
                <Box padding={4} background="success100">
                  <Flex direction="column" alignItems="flex-start" gap={2}>
                    <Flex alignItems="center" gap={2}>
                      <CreditCard />
                      <Typography variant="sigma" textColor="success700">TODAY'S REVENUE</Typography>
                    </Flex>
                    <Typography variant="alpha" textColor="success700" fontWeight="bold">
                      {formatCurrency(revenue.today)}
                    </Typography>
                    <Typography variant="pi" textColor="success600">
                      {format(new Date(), 'MMMM d, yyyy')}
                    </Typography>
                  </Flex>
                </Box>
              </Card>
            </GridItem>

            <GridItem col={6}>
              <Card>
                <Box padding={4} background="primary100">
                  <Flex direction="column" alignItems="flex-start" gap={2}>
                    <Flex alignItems="center" gap={2}>
                      <TrendingUp />
                      <Typography variant="sigma" textColor="primary700">THIS WEEK</Typography>
                    </Flex>
                    <Typography variant="alpha" textColor="primary700" fontWeight="bold">
                      {formatCurrency(revenue.week)}
                    </Typography>
                    <Typography variant="pi" textColor="primary600">
                      Week {format(new Date(), 'w')} of {format(new Date(), 'yyyy')}
                    </Typography>
                  </Flex>
                </Box>
              </Card>
            </GridItem>

            <GridItem col={6}>
              <Card>
                <Box padding={4} background="secondary100">
                  <Flex direction="column" alignItems="flex-start" gap={2}>
                    <Flex alignItems="center" gap={2}>
                      <Calendar />
                      <Typography variant="sigma" textColor="secondary700">THIS MONTH</Typography>
                    </Flex>
                    <Typography variant="alpha" textColor="secondary700" fontWeight="bold">
                      {formatCurrency(revenue.month)}
                    </Typography>
                    <Typography variant="pi" textColor="secondary600">
                      {format(new Date(), 'MMMM yyyy')}
                    </Typography>
                  </Flex>
                </Box>
              </Card>
            </GridItem>

            <GridItem col={6}>
              <Card>
                <Box padding={4} background="warning100">
                  <Flex direction="column" alignItems="flex-start" gap={2}>
                    <Flex alignItems="center" gap={2}>
                      <DollarSign />
                      <Typography variant="sigma" textColor="warning700">PENDING DEPOSITS</Typography>
                    </Flex>
                    <Typography variant="alpha" textColor="warning700" fontWeight="bold">
                      {formatCurrency(revenue.pendingDeposits)}
                    </Typography>
                    <Typography variant="pi" textColor="warning600">
                      Awaiting confirmation
                    </Typography>
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

export default RevenueSummary;
