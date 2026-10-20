// Default investment options and event presets.
//
// Every option is described by the cash flows for ONE share (unit):
//   flows[0] is the price paid now (negative), flows[k] is what the share pays
//   at the end of year k after purchase. Positive = money in, negative = money out.
// `years` lists the rounds (Year 0, Year 1, ...) in which the option is offered
// by default. The teacher can change the line-up for any round in the console.
//
// Answer key (PW at the default 5% bank rate) is shown in the teacher console.

export const DEFAULT_SETTINGS = {
  startCash: 10000,
  years: 8,            // number of years the game runs (Year 0 ... Year 8)
  bankRate: 0.05,      // savings account rate, compounded yearly; also the valuation rate
  overdraftRate: 0.15, // interest charged when a student's cash goes below zero
};

export const DEFAULT_OFFERS = [
  // ---- Year 0: simple vs compound interest, first cash-flow diagrams
  {
    id: 'bond7', name: 'Savings Bond', tag: 'bond', years: [0],
    blurb: '7% simple interest per year on the original $1,000. Principal and all interest are paid back together at the end of year 8.',
    flows: [-1000, 0, 0, 0, 0, 0, 0, 0, 1560],
  },
  {
    id: 'cd6', name: 'Certificate of Deposit', tag: 'bond', years: [0],
    blurb: '6% interest compounded yearly: each year’s interest also earns interest. Paid back at the end of year 8.',
    flows: [-1000, 0, 0, 0, 0, 0, 0, 0, 1593.85],
  },
  {
    id: 'foodtruck', name: 'Taco Truck', tag: 'food', years: [0],
    blurb: 'Buy a share of a food truck. It earns $600 a year for 4 years, then the truck is sold for $400.',
    flows: [-2000, 600, 600, 600, 1000],
  },
  {
    id: 'miningrig', name: 'Crypto Mining Rig', tag: 'tech', years: [0],
    blurb: 'Earns $700 a year for 3 years. After that the hardware is obsolete and worth nothing.',
    flows: [-2000, 700, 700, 700],
  },

  // ---- Year 1: long life vs short life
  {
    id: 'solar', name: 'Community Solar Farm', tag: 'energy', years: [1],
    blurb: 'Sells electricity to the grid: $450 a year for 10 years. No salvage value.',
    flows: [-3000, 450, 450, 450, 450, 450, 450, 450, 450, 450, 450],
  },
  {
    id: 'kiosk', name: 'Phone Repair Kiosk', tag: 'retail', years: [1],
    blurb: 'A mall kiosk that earns $500 a year for 4 years.',
    flows: [-1500, 500, 500, 500, 500],
  },

  // ---- Year 2: non-uniform cash flows
  {
    id: 'printer3d', name: '3D Printing Startup', tag: 'tech', years: [2],
    blurb: 'Needs another $500 at the end of year 1 to get going, then earns $1,000 a year for 4 years.',
    flows: [-2500, -500, 1000, 1000, 1000, 1000],
  },
  {
    id: 'vending', name: 'Vending Machines', tag: 'retail', years: [2],
    blurb: 'Snack machines on campus: $260 a year for 5 years.',
    flows: [-1000, 260, 260, 260, 260, 260],
  },
  {
    id: 'billboard', name: 'Billboard Lease', tag: 'retail', years: [2],
    blurb: 'Rent out a highway billboard: $400 a year for 3 years.',
    flows: [-1200, 400, 400, 400],
  },

  // ---- Year 3: future worth of a series of payments
  {
    id: 'annuity', name: 'College Savings Plan', tag: 'bond', years: [3],
    blurb: 'Pay $500 now and $500 at the end of each of the next 3 years. Receive $2,350 at the end of year 4.',
    flows: [-500, -500, -500, -500, 2350],
  },
  {
    id: 'drone', name: 'Drone Delivery Pilot', tag: 'tech', years: [3],
    blurb: 'A big bet: earns $1,300 a year for 4 years.',
    flows: [-4000, 1300, 1300, 1300, 1300],
  },
  {
    id: 'laundry', name: 'Laundromat Upgrade', tag: 'retail', years: [3],
    blurb: 'New washers bring in an extra $450 a year for 5 years.',
    flows: [-1800, 450, 450, 450, 450, 450],
  },

  // ---- Year 4
  {
    id: 'wind', name: 'Wind Turbine Share', tag: 'energy', years: [4],
    blurb: 'Earns $400 a year for 8 years.',
    flows: [-2500, 400, 400, 400, 400, 400, 400, 400, 400],
  },
  {
    id: 'rental', name: 'Equipment Rental', tag: 'retail', years: [4],
    blurb: 'Rent out construction equipment: $700 a year for 3 years.',
    flows: [-1800, 700, 700, 700],
  },

  // ---- Year 5
  {
    id: 'tnote', name: 'Treasury Note', tag: 'bond', years: [5],
    blurb: '6% simple interest for 3 years. $1,180 paid back at the end of year 3.',
    flows: [-1000, 0, 0, 1180],
  },
  {
    id: 'franchise', name: 'Sandwich Franchise', tag: 'food', years: [5],
    blurb: 'A big franchise fee, then $1,200 a year for 5 years.',
    flows: [-5000, 1200, 1200, 1200, 1200, 1200],
  },
  {
    id: 'greenhouse', name: 'Hydroponic Greenhouse', tag: 'food', years: [5],
    blurb: 'Nothing the first year while plants grow, then $700 a year for 2 years.',
    flows: [-1200, 0, 700, 700],
  },

  // ---- Year 6
  {
    id: 'popup', name: 'Pop-up Shop', tag: 'retail', years: [6],
    blurb: 'A one-year holiday store: $1,150 back at the end of the year.',
    flows: [-1000, 1150],
  },
  {
    id: 'concert', name: 'Concert Promotion', tag: 'retail', years: [6],
    blurb: 'Promote a two-year tour: $1,100 a year for 2 years.',
    flows: [-2000, 1100, 1100],
  },
  {
    id: 'led', name: 'LED Lighting Retrofit', tag: 'energy', years: [6],
    blurb: 'Lower power bills save a business $850 a year for 2 years; you get the savings.',
    flows: [-1500, 850, 850],
  },

  // ---- Year 7 (last round: everything pays at Year 8)
  {
    id: 'carflip', name: 'Used-Car Flip', tag: 'retail', years: [7],
    blurb: 'Fix up a car and sell it in a year for $3,240.',
    flows: [-3000, 3240],
  },
  {
    id: 'phoneresale', name: 'Phone Resale', tag: 'tech', years: [7],
    blurb: 'Buy phones in bulk now and sell them in a year for $1,040.',
    flows: [-1000, 1040],
  },
];

export const TAG_LABELS = {
  bond: 'Bonds and deposits',
  food: 'Food',
  tech: 'Tech',
  energy: 'Energy',
  retail: 'Business',
};

// Event presets the teacher can fire. `kind`:
//   rate      - change the bank rate by `delta` (affects savings and valuations)
//   cash      - every student's cash changes by `amount`
//   perShare  - every share of the tagged investments pays/costs `amount` now
//   revenue   - multiply future positive cash flows of tagged investments by `factor`
//               for `duration` years ('next' = next year only, 'rest' = rest of the game)
export const EVENT_PRESETS = [
  { id: 'rateUp', kind: 'rate', delta: 0.02,
    title: 'Interest rates go up 2%',
    detail: 'Savings earn more from now on. Fixed payments you already own are worth less today.' },
  { id: 'rateDown', kind: 'rate', delta: -0.02,
    title: 'Interest rates go down 2%',
    detail: 'Savings earn less from now on. Fixed payments you already own are worth more today.' },
  { id: 'emergency', kind: 'cash', amount: -1500,
    title: 'Emergency car repair',
    detail: 'Everyone pays $1,500 now. If your cash runs out it comes from savings, then from a 15% overdraft.' },
  { id: 'refund', kind: 'cash', amount: 1000,
    title: 'Tax refund',
    detail: 'Everyone receives $1,000 cash.' },
  { id: 'recession', kind: 'revenue', tags: ['food', 'retail'], factor: 0.6, duration: 'next',
    title: 'Recession',
    detail: 'Food and business investments earn 40% less next year.' },
  { id: 'energyBoom', kind: 'revenue', tags: ['energy'], factor: 1.3, duration: 'rest',
    title: 'Energy prices jump',
    detail: 'Energy investments earn 30% more for the rest of the game.' },
  { id: 'techBust', kind: 'revenue', tags: ['tech'], factor: 0.5, duration: 'rest',
    title: 'Tech bust',
    detail: 'Tech investments earn half as much for the rest of the game.' },
  { id: 'breakdown', kind: 'perShare', tags: ['food'], amount: -300,
    title: 'Kitchen equipment breaks',
    detail: 'Owners of food investments pay $300 per share for repairs.' },
];

export function defaultOfferIdsForYear(catalog, year) {
  return Object.values(catalog)
    .filter((o) => (o.years || []).includes(year))
    .map((o) => o.id);
}
