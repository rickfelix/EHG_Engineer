import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:3000');

ws.on('open', () => {
  console.log('🔌 Connected to WebSocket server\n');
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());

  if (message.type === 'state') {
    console.log('📊 Received state update');
    console.log('📦 Total Strategic Directives:', message.data.strategicDirectives?.length);

    // Find SD-UAT-001
    const uatSD = message.data.strategicDirectives?.find(sd => sd.sdKey === 'SD-UAT-001');

    if (uatSD) {
      console.log('\n✅ Found SD-UAT-001:');
      console.log('  ID:', uatSD.id);
      console.log('  SD Key:', uatSD.sdKey);
      console.log('  Title:', uatSD.title);
      console.log('  Status:', uatSD.status);
      console.log('  Priority:', uatSD.priority);
      console.log('  Category:', uatSD.category);
      console.log('  Target Application:', uatSD.targetApplication);
      console.log('  Sequence Rank:', uatSD.sequenceRank);

      // Check filters
      console.log('\n🎯 Filter Analysis:');
      const statusFilter = 'active,draft';
      const priorityFilter = 'critical,high';
      const applicationFilter = 'EHG';
      const categoryFilter = 'all';

      // Status check
      const statusMatch = statusFilter.split(',').includes(uatSD.status?.toLowerCase());
      console.log(`  Status '${uatSD.status}' in ['active','draft']: ${statusMatch}`);

      // Priority check
      const priorityMatch = priorityFilter.split(',').includes(uatSD.priority?.toLowerCase());
      console.log(`  Priority '${uatSD.priority}' in ['critical','high']: ${priorityMatch}`);

      // Application check
      const applicationMatch = uatSD.targetApplication === applicationFilter;
      console.log(`  Application '${uatSD.targetApplication}' === 'EHG': ${applicationMatch}`);

      // Category check
      const categoryMatch = categoryFilter === 'all' || uatSD.category?.toLowerCase() === categoryFilter.toLowerCase();
      console.log(`  Category '${uatSD.category}' filter: ${categoryMatch}`);

      console.log(`\n${statusMatch && priorityMatch && applicationMatch && categoryMatch ? '✅ SHOULD BE VISIBLE' : '❌ WILL BE FILTERED OUT'}`);
    } else {
      console.log('\n❌ SD-UAT-001 NOT FOUND in strategicDirectives array');

      // Show first 3 SDs for comparison
      console.log('\n📋 First 3 SDs in array:');
      message.data.strategicDirectives?.slice(0, 3).forEach(sd => {
        console.log(`  - ${sd.sdKey}: ${sd.title} (status=${sd.status}, priority=${sd.priority}, app=${sd.targetApplication})`);
      });
    }

    ws.close();
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error);
});

ws.on('close', () => {
  console.log('\n🔌 Disconnected from WebSocket server');
  process.exit(0);
});