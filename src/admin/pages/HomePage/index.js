import React from 'react';
import { 
  Layout, 
  HeaderLayout, 
  ContentLayout,
  Grid,
  GridItem,
  Box
} from '@strapi/design-system';
import { Helmet } from 'react-helmet';

// Import custom dashboard widgets
import TodayAppointments from '../components/TodayAppointments';
import RevenueSummary from '../components/RevenueSummary';
import QuickStats from '../components/QuickStats';

const HomePage = () => {
  return (
    <Layout>
      <Helmet title="Dashboard - LashBabe Admin" />
      
      <HeaderLayout 
        title="LashBabe Dashboard" 
        subtitle="Welcome back! Here's your business overview."
      />
      
      <ContentLayout>
        <Box paddingBottom={10}>
          <Grid gap={6}>
            {/* Revenue Summary - Full Width */}
            <GridItem col={12}>
              <RevenueSummary />
            </GridItem>
            
            {/* Quick Stats - Full Width */}
            <GridItem col={12}>
              <QuickStats />
            </GridItem>
            
            {/* Today's Appointments - Full Width */}
            <GridItem col={12}>
              <TodayAppointments />
            </GridItem>
          </Grid>
        </Box>
      </ContentLayout>
    </Layout>
  );
};

export default HomePage;
