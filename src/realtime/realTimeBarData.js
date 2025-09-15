const signalR = require("@microsoft/signalr");

const ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJodHRwOi8vc2NoZW1hcy54bWxzb2FwLm9yZy93cy8yMDA1LzA1L2lkZW50aXR5L2NsYWltcy9uYW1laWRlbnRpZmllciI6IjE5NDY5OSIsImh0dHA6Ly9zY2hlbWFzLnhtbHNvYXAub3JnL3dzLzIwMDUvMDUvaWRlbnRpdHkvY2xhaW1zL3NpZCI6IjgxNDNhZWI1LTQ3MGMtNDBmMi1iMzJlLTIyNmQxN2E5YTUzNCIsImh0dHA6Ly9zY2hlbWFzLnhtbHNvYXAub3JnL3dzLzIwMDUvMDUvaWRlbnRpdHkvY2xhaW1zL25hbWUiOiJzdW1vbmV5MSIsImh0dHA6Ly9zY2hlbWFzLm1pY3Jvc29mdC5jb20vd3MvMjAwOC8wNi9pZGVudGl0eS9jbGFpbXMvcm9sZSI6InVzZXIiLCJtc2QiOiJDTUVHUk9VUF9UT0IiLCJtZmEiOiJ2ZXJpZmllZCIsImV4cCI6MTc1Nzk1OTQzNH0.mnmERv41Fth3yNQtA_6kNZuIM_qDS18WUyeFTWYPhc8";

const connection = new signalR.HubConnectionBuilder()
  .withUrl(`https://chartapi.topstepx.com/hubs/chart?access_token=${ACCESS_TOKEN}`, {
    skipNegotiation: true,
    transport: signalR.HttpTransportType.WebSockets
  })
  .configureLogging(signalR.LogLevel.Information)
  .withAutomaticReconnect()
  .build();

connection.on("RealTimeBar", (symbol, resolution, bar) => {
  console.log(`\n📊 RealTimeBar: ${symbol} | ${resolution}`);
  console.log(`Time: ${bar.timestamp}`);
  console.log(`O/H/L/C: ${bar.open} / ${bar.high} / ${bar.low} / ${bar.close}`);
  console.log(`Volume: ${bar.volume} | Tick Vol: ${bar.tickVolume}`);
  console.log(`Closed: ${bar.isClosed}`);
});

connection.start()
  .then(async () => {
    console.log("✅ Connected to SignalR hub. Subscribing to RealTimeBar...");

    await connection.invoke("SubscribeBars", "F.US.MNQ", "100T")
      .then(() => console.log("📡 Subscribed to RealTimeBar for F.US.MNQ (100T)"))
      .catch(err => console.error("❌ SubscribeBars failed:", err));
  })
  .catch(err => {
    console.error("❌ Connection failed:", err);
  });

