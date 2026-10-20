// Default investment options and event presets.
//
// Every option is described by the cash flows for ONE share (unit):
//   flows[0] is the price paid now (negative), flows[k] is what the share pays
//   at the end of year k after purchase. Positive = money in, negative = money out.
// Each year's market is drawn at random from this list (see drawOffers in
// engine.js); the teacher can swap offers before opening the market.
// The answer key (PW, AW, IRR at the current bank rate) is in the teacher console.

export const DEFAULT_SETTINGS = {
  startCash: 10000,
  years: 8,              // number of years the game runs (Year 0 ... Year 8)
  bankRate: 0.05,        // savings account rate, compounded yearly; also the valuation rate
  overdraftRate: 0.15,   // interest charged when a student's cash goes below zero
  withdrawPenalty: 0.05, // early-withdrawal penalty: % of any amount taken out of savings
  offersPerYear: 4,      // how many investments each year's market shows
};

export const DEFAULT_OFFERS = [
  // ---- bonds and deposits: simple vs compound interest, single payments
  {
    id: 'bond7', name: 'Savings Bond', tag: 'bond',
    blurb: '7% simple interest per year on the original $1,000. Principal and all interest are paid back together 8 years after you buy.',
    flows: [-1000, 0, 0, 0, 0, 0, 0, 0, 1560],
  },
  {
    id: 'cd6', name: 'Certificate of Deposit', tag: 'bond',
    blurb: '6% interest compounded yearly: each year’s interest also earns interest. Paid back 8 years after you buy.',
    flows: [-1000, 0, 0, 0, 0, 0, 0, 0, 1593.85],
  },
  {
    id: 'tnote', name: 'Treasury Note', tag: 'bond',
    blurb: '6% simple interest for 3 years. $1,180 paid back at the end of year 3.',
    flows: [-1000, 0, 0, 1180],
  },
  {
    id: 'zerobond', name: 'Zero-Coupon Bond', tag: 'bond',
    blurb: 'Pays no interest along the way. Buy it for $760 and get $1,000 back after 5 years.',
    flows: [-760, 0, 0, 0, 0, 1000],
  },
  {
    id: 'muni', name: 'City Bond', tag: 'bond',
    blurb: 'Pays $60 interest every year for 5 years, then returns your $1,000.',
    flows: [-1000, 60, 60, 60, 60, 1060],
  },
  {
    id: 'corpbond', name: 'Corporate Bond', tag: 'bond',
    blurb: 'Pays $40 interest every year for 5 years, then returns your $1,000.',
    flows: [-1000, 40, 40, 40, 40, 1040],
  },
  {
    id: 'annuity', name: 'College Savings Plan', tag: 'bond',
    blurb: 'Pay $500 now and $500 at the end of each of the next 3 years (taken from your cash automatically). Receive $2,350 at the end of year 4.',
    flows: [-500, -500, -500, -500, 2350],
  },

  // ---- food
  {
    id: 'foodtruck', name: 'Taco Truck', tag: 'food',
    blurb: 'Buy a share of a food truck. It earns $600 a year for 4 years, then the truck is sold for $400.',
    flows: [-2000, 600, 600, 600, 1000],
  },
  {
    id: 'coffeecart', name: 'Campus Coffee Cart', tag: 'food',
    blurb: 'Earns $310 a year for 3 years.',
    flows: [-800, 310, 310, 310],
  },
  {
    id: 'rooftop', name: 'Rooftop Garden', tag: 'food',
    blurb: 'Nothing for two years while the garden gets going, then $400 a year for 3 years.',
    flows: [-1000, 0, 0, 400, 400, 400],
  },
  {
    id: 'franchise', name: 'Sandwich Franchise', tag: 'food',
    blurb: 'A big franchise fee, then $1,200 a year for 5 years.',
    flows: [-5000, 1200, 1200, 1200, 1200, 1200],
  },
  {
    id: 'greenhouse', name: 'Hydroponic Greenhouse', tag: 'food',
    blurb: 'Nothing the first year while plants grow, then $700 a year for 2 years.',
    flows: [-1200, 0, 700, 700],
  },

  // ---- tech
  {
    id: 'miningrig', name: 'Crypto Mining Rig', tag: 'tech',
    blurb: 'Earns $700 a year for 3 years. After that the hardware is obsolete and worth nothing.',
    flows: [-2000, 700, 700, 700],
  },
  {
    id: 'printer3d', name: '3D Printing Startup', tag: 'tech',
    blurb: 'Needs another $500 at the end of year 1 to get going (taken from your cash), then earns $1,000 a year for 4 years.',
    flows: [-2500, -500, 1000, 1000, 1000, 1000],
  },
  {
    id: 'drone', name: 'Drone Delivery Pilot', tag: 'tech',
    blurb: 'A big bet: earns $1,300 a year for 4 years.',
    flows: [-4000, 1300, 1300, 1300, 1300],
  },
  {
    id: 'appstudio', name: 'App Studio', tag: 'tech',
    blurb: 'Earnings grow as the app catches on: $300, then $700, $1,100 and $1,500.',
    flows: [-3000, 300, 700, 1100, 1500],
  },
  {
    id: 'scooters', name: 'E-Scooter Fleet', tag: 'tech',
    blurb: 'Earns $1,000 a year for 3 years. In year 4 you pay $300 to recycle the batteries.',
    flows: [-2500, 1000, 1000, 1000, -300],
  },
  {
    id: 'appshares', name: 'Delivery App Shares', tag: 'tech',
    blurb: 'Pays nothing until the company is bought out in year 4 for $1,300 a share.',
    flows: [-1000, 0, 0, 0, 1300],
  },
  {
    id: 'phoneresale', name: 'Phone Resale', tag: 'tech',
    blurb: 'Buy phones in bulk now and sell them in a year for $1,040.',
    flows: [-1000, 1040],
  },

  // ---- energy
  {
    id: 'solar', name: 'Community Solar Farm', tag: 'energy',
    blurb: 'Sells electricity to the grid: $450 a year for 10 years. No salvage value.',
    flows: [-3000, 450, 450, 450, 450, 450, 450, 450, 450, 450, 450],
  },
  {
    id: 'wind', name: 'Wind Turbine Share', tag: 'energy',
    blurb: 'Earns $400 a year for 8 years.',
    flows: [-2500, 400, 400, 400, 400, 400, 400, 400, 400],
  },
  {
    id: 'led', name: 'LED Lighting Retrofit', tag: 'energy',
    blurb: 'Lower power bills save a business $850 a year for 2 years; you get the savings.',
    flows: [-1500, 850, 850],
  },
  {
    id: 'heatpump', name: 'Geothermal Heat Pump', tag: 'energy',
    blurb: 'Saves a school $300 a year on heating for 12 years; you get the savings.',
    flows: [-2500, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300],
  },
  {
    id: 'battery', name: 'Grid Battery Storage', tag: 'energy',
    blurb: 'Takes a year to build, then earns $1,000 a year for 5 years.',
    flows: [-4000, 0, 1000, 1000, 1000, 1000, 1000],
  },

  // ---- business
  {
    id: 'kiosk', name: 'Phone Repair Kiosk', tag: 'retail',
    blurb: 'A mall kiosk that earns $500 a year for 4 years.',
    flows: [-1500, 500, 500, 500, 500],
  },
  {
    id: 'vending', name: 'Vending Machines', tag: 'retail',
    blurb: 'Snack machines on campus: $260 a year for 5 years.',
    flows: [-1000, 260, 260, 260, 260, 260],
  },
  {
    id: 'billboard', name: 'Billboard Lease', tag: 'retail',
    blurb: 'Rent out a highway billboard: $400 a year for 3 years.',
    flows: [-1200, 400, 400, 400],
  },
  {
    id: 'laundry', name: 'Laundromat Upgrade', tag: 'retail',
    blurb: 'New washers bring in an extra $450 a year for 5 years.',
    flows: [-1800, 450, 450, 450, 450, 450],
  },
  {
    id: 'rental', name: 'Equipment Rental', tag: 'retail',
    blurb: 'Rent out construction equipment: $700 a year for 3 years.',
    flows: [-1800, 700, 700, 700],
  },
  {
    id: 'popup', name: 'Pop-up Shop', tag: 'retail',
    blurb: 'A one-year holiday store: $1,150 back at the end of the year.',
    flows: [-1000, 1150],
  },
  {
    id: 'concert', name: 'Concert Promotion', tag: 'retail',
    blurb: 'Promote a two-year tour: $1,100 a year for 2 years.',
    flows: [-2000, 1100, 1100],
  },
  {
    id: 'carflip', name: 'Used-Car Flip', tag: 'retail',
    blurb: 'Fix up a car and sell it in a year for $3,240.',
    flows: [-3000, 3240],
  },
  {
    id: 'icerink', name: 'Winter Ice Rink', tag: 'retail',
    blurb: 'A one-season rink: $1,260 back at the end of the year.',
    flows: [-1200, 1260],
  },
  {
    id: 'gym', name: 'Gym Equipment Lease', tag: 'retail',
    blurb: 'Earns $900, then $700, then $500 as the machines wear out.',
    flows: [-2000, 900, 700, 500],
  },
  {
    id: 'photobooth', name: 'Wedding Photo Booth', tag: 'retail',
    blurb: 'Earns $400 a year for 2 years, then $200 in its last year.',
    flows: [-900, 400, 400, 200],
  },
  {
    id: 'tutoring', name: 'Tutoring Business', tag: 'retail',
    blurb: 'A small start: $200 a year for 3 years.',
    flows: [-500, 200, 200, 200],
  },
  {
    id: 'bikeshare', name: 'Bike-Share Station', tag: 'retail',
    blurb: 'Earns $370 a year for 5 years.',
    flows: [-1500, 370, 370, 370, 370, 370],
  },
  {
    id: 'duplex', name: 'Rental Duplex Share', tag: 'retail',
    blurb: 'Rent pays $500 a year for 6 years, then the building is sold and your share brings $5,000.',
    flows: [-6000, 500, 500, 500, 500, 500, 5500],
  },
];

export const TAG_LABELS = {
  bond: 'Bonds and deposits',
  food: 'Food',
  tech: 'Tech',
  energy: 'Energy',
  retail: 'Business',
};

// Event presets the teacher can fire. They hit everyone the same way.
//   rate - change the bank rate by `delta` (affects savings and valuations)
//   cash - every student's cash changes by `share` x starting money
export const EVENT_PRESETS = [
  { id: 'rateUp', kind: 'rate', delta: 0.02,
    title: 'Interest rates go up 2%',
    detail: 'Savings earn more from now on. Fixed payments you already own are worth less today.' },
  { id: 'rateDown', kind: 'rate', delta: -0.02,
    title: 'Interest rates go down 2%',
    detail: 'Savings earn less from now on. Fixed payments you already own are worth more today.' },
  { id: 'carRepair', kind: 'cash', share: -0.05,
    title: 'Car repair bill',
    detail: 'Everyone pays {amt} now. If your cash runs out it comes from savings (with the withdrawal penalty), then from the overdraft.' },
  { id: 'refund', kind: 'cash', share: 0.05,
    title: 'Tax refund',
    detail: 'Everyone receives {amt} in cash.' },
];

// Fill in dollar amounts that depend on the game's starting money.
export function resolveEvent(ev, settings) {
  if (ev.kind !== 'cash' || ev.share == null) return ev;
  const amount = Math.round((settings.startCash * ev.share) / 50) * 50;
  const amt = `$${Math.abs(amount).toLocaleString('en-US')}`;
  return { ...ev, amount, detail: ev.detail.replace('{amt}', amt) };
}
