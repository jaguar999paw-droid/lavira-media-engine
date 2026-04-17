// orchestrator/brand.js — Lavira Safaris Brand Dictionary v3
// Extracted from lavirasafaris.com — full content for AI caption generation

const BRAND = {
  name:     'Lavira Safaris',
  tagline:  'Making Your Safari Experience Memorable',
  slogan:   'Unforgettable Kenya & Tanzania Safari Experiences',
  website:  'https://lavirasafaris.com',
  phone:    '+254 721 757 387',
  emergency:'+254 702 266 686',
  email:    'info@lavirasafaris.com',
  base:     'Nairobi, Kenya',
  socials: {
    instagram: '@lavirasafaris',
    facebook:  'lavirasafaris',
    twitter:   '@LaviraSafaris1',
    instagram_url: 'https://instagram.com/lavirasafaris/',
    facebook_url:  'https://web.facebook.com/lavirasafaris',
    twitter_url:   'https://x.com/LaviraSafaris1',
    tiktok:        '@lavira.safaris',
    tiktok_url:    'https://www.tiktok.com/@lavira.safaris',
    whatsapp:      '+254721757387',
    whatsapp_url:  'https://api.whatsapp.com/send?phone=254721757387',
    getyourguide:  'https://www.getyourguide.com/-s662818'
  },
  colors: { primary:'#2D6A4F', accent:'#F4A261', dark:'#1B2830', light:'#F9F5F0' },
  logo_url: 'https://lavirasafaris.com/wp-content/uploads/2025/02/lavira-logo.svg',

  // ── DESTINATIONS ────────────────────────────────────────────────────────────
  destinations: [
    'Masai Mara', 'Amboseli', 'Tsavo East', 'Tsavo West',
    'Lake Naivasha', 'Lake Nakuru', 'Samburu',
    'Ol Pejeta', 'Diani Beach', 'Lamu', 'Watamu', 'Nairobi'
  ],

  destination_profiles: {
    'Masai Mara': {
      headline: 'Best known for the yearly Wildebeest Migration & Big Cats',
      wildlife: ['lion', 'leopard', 'cheetah', 'wildebeest', 'zebra', 'hippo', 'crocodile', 'elephant'],
      activities: ['game drives', 'hot air balloon safari', 'Maasai village visit', 'river crossing viewing'],
      best_time: 'July–October (Great Migration)',
      highlight: 'Great Migration river crossing at Mara River',
      lodges: ['Royal Mara Safari Lodge', 'Mara Serena Lodge']
    },
    'Amboseli': {
      headline: 'Peak views of Mt. Kilimanjaro & large elephant herds',
      wildlife: ['elephant', 'lion', 'cheetah', 'giraffe', 'zebra', 'wildebeest'],
      activities: ['game drives', 'Maasai cultural tours', 'photography', 'sundowners'],
      best_time: 'June–October & January–February',
      highlight: 'Elephants silhouetted against Mt. Kilimanjaro at sunrise'
    },
    'Tsavo East': {
      headline: 'Largest park — red-soiled elephant herds & maneless lions',
      wildlife: ['elephant', 'lion', 'buffalo', 'leopard', 'hippo', 'crocodile'],
      activities: ['game drives', 'Galana River picnics', 'Lugard Falls visit'],
      best_time: 'June–September & January–February',
      highlight: 'Red elephants at the waterhole at dusk'
    },
    'Samburu': {
      headline: 'Home of the Samburu Special Five — unique northern species',
      wildlife: ['Somali Ostrich', 'Beisa Oryx', "Grevy's Zebra", 'Reticulated Giraffe', 'Gerenuk'],
      activities: ['game drives', 'Samburu cultural visits', 'Ewaso Nyiro River walks'],
      best_time: 'June–October & January–March',
      highlight: 'Reticulated giraffe drinking at the Ewaso Nyiro River'
    },
    'Lake Nakuru': {
      headline: 'Flamingo lake & rhino sanctuary in the Rift Valley',
      wildlife: ['flamingo', 'rhino', 'lion', 'leopard', 'buffalo', 'baboon'],
      activities: ['game drives', 'boat rides', 'Rift Valley viewpoints'],
      best_time: 'Year-round',
      highlight: 'Thousands of flamingos turning the lake pink at sunrise'
    },
    'Ol Pejeta': {
      headline: 'Largest black rhino sanctuary — home to the last northern white rhinos',
      wildlife: ['rhino', 'chimpanzee', 'lion', 'leopard', 'elephant', 'buffalo'],
      activities: ['rhino tracking', 'chimp sanctuary visit', 'night game drives'],
      best_time: 'Year-round',
      highlight: 'Close encounter with endangered black rhino'
    }
  },

  // ── SAFARI PACKAGES ──────────────────────────────────────────────────────────
  safari_packages: [
    { name:'2 Days Lake Naivasha & Lake Nakuru', duration:'2 days', destinations:['Lake Naivasha','Lake Nakuru'], highlights:['flamingos','rhino','boat ride'] },
    { name:'2 Days Masai Mara Safari', duration:'2 days', destinations:['Masai Mara'], highlights:['Big Five','game drives','Maasai culture'] },
    { name:'2 Days Ol Pejeta Safari', duration:'2 days', destinations:['Ol Pejeta'], highlights:['rhino','chimpanzee','Big Five'] },
    { name:'3 Days Amboseli Safari', duration:'3 days', destinations:['Amboseli'], highlights:['elephant','Kilimanjaro views','sundowners'] },
    { name:'3 Days Samburu Safari', duration:'3 days', destinations:['Samburu'], highlights:['Special Five','cultural visit','northern wilderness'] },
    { name:'3 Days Tsavo West & Amboseli', duration:'3 days', destinations:['Tsavo West','Amboseli'], highlights:['Mzima Springs','elephant','Kilimanjaro'] },
    { name:'3 Days Tsavo West & East', duration:'3 days', destinations:['Tsavo West','Tsavo East'], highlights:['red elephants','Lugard Falls','big game'] },
    { name:'4 Days Ol Pejeta & Samburu', duration:'4 days', destinations:['Ol Pejeta','Samburu'], highlights:['rhino','Special Five','cultural immersion'] },
    { name:'4 Days Tsavo East, West & Amboseli', duration:'4 days', destinations:['Tsavo East','Tsavo West','Amboseli'], highlights:['red elephants','Kilimanjaro','Big Five'] },
    { name:'5 Days Amboseli & Masai Mara', duration:'5 days', destinations:['Amboseli','Masai Mara'], highlights:['elephant','Big Cats','migration'] },
    { name:'5 Days Amboseli, Lake Naivasha & Masai Mara', duration:'5 days', destinations:['Amboseli','Lake Naivasha','Masai Mara'], highlights:['Kilimanjaro','flamingos','Big Five'] },
    { name:'5 Days Lake Nakuru & Masai Mara', duration:'5 days', destinations:['Lake Nakuru','Masai Mara'], highlights:['flamingos','rhino','lion'] },
    { name:'5 Days Ol Pejeta, Lake Naivasha & Masai Mara', duration:'5 days', destinations:['Ol Pejeta','Lake Naivasha','Masai Mara'], highlights:['rhino','flamingos','Big Five'] },
    { name:'6 Days Samburu, Nakuru & Masai Mara', duration:'6 days', destinations:['Samburu','Lake Nakuru','Masai Mara'], highlights:['Special Five','flamingos','migration'] }
  ],

  // ── SERVICES ─────────────────────────────────────────────────────────────────
  services: {
    wildlife_safaris: ['Game Drives in custom safari vehicles', 'Big Five Encounters', 'Great Migration Tours', 'Bird Watching tours'],
    cultural_tours:   ['Maasai Village Visits', 'Cultural Festivals', 'Community-Based Tourism'],
    adventure:        ['Hiking & Trekking (Mt Kenya, Aberdare, Chyulu Hills)', 'Hot Air Balloon Safaris at sunrise', 'Biking & Cycling Tours', 'Rock Climbing at Hell\'s Gate'],
    beach_holidays:   ['Diani Beach', 'Watamu', 'Malindi', 'Lamu', 'Snorkeling & Diving', 'Dhow Cruises'],
    honeymoon:        ['Private Beach Villas', 'Romantic Star Dinners', 'Couples Safaris'],
    day_trips:        ['Nairobi National Park', 'Giraffe Centre', 'Karen Blixen Museum', 'David Sheldrick Elephant Orphanage', 'Hell\'s Gate', 'Fort Jesus Mombasa'],
    transfers:        ['Airport Meet & Greet', 'Air-conditioned vehicles', 'Hotel transfers', 'Group & family vehicles']
  },

  // ── WILDLIFE VOCABULARY ───────────────────────────────────────────────────────
  wildlife: {
    big_five: ['lion', 'leopard', 'elephant', 'buffalo', 'rhino'],
    samburu_five: ['Somali Ostrich', 'Beisa Oryx', "Grevy's Zebra", 'Reticulated Giraffe', 'Gerenuk'],
    other_key: ['cheetah', 'hippo', 'crocodile', 'giraffe', 'zebra', 'wildebeest', 'flamingo', 'chimpanzee'],
    migration: 'Great Wildebeest Migration — 1.5 million wildebeest July–October, Mara River crossings'
  },

  // ── USP PHRASES (from site copy) ──────────────────────────────────────────────
  usps: [
    'Expert guides with encyclopedic knowledge of wildlife & ecosystems',
    'Personalized & sustainable safari experiences',
    'Responsible tourism that supports local communities',
    'Custom-built open-roof safari vehicles',
    'Lifelong memories — every detail handled for you',
    'Safe, comfortable & enriching — from airport to bush',
    'Passionate about conservation & African nature'
  ],

  // ── REAL GUEST TESTIMONIAL FRAGMENTS ─────────────────────────────────────────
  testimonials: [
    { guest:'Bernard K', quote:'unforgettable experience, exceeded all expectations', highlight:'customized days, amazing lodges, incredible wildlife sightings' },
    { guest:'Leece M',   quote:'dream come true — handling all details so we could focus on the experience', highlight:'guide Gumo Victor made wildlife viewing magical' },
    { guest:'Elijah M',  quote:'truly the trip of a lifetime', highlight:'hot air balloon ride, wildebeest migration, comfortable vehicles for photography' },
    { guest:'Matteo J',  quote:'two-week private safari in Kenya and Tanzania was truly unforgettable', highlight:'saw Great Migration river crossing, hippo boat ride, nature walk' },
    { guest:'Dennis N',  quote:'from the moment we were picked up at the airport, everything was perfectly organized', highlight:'Big Five, Mara Serena Lodge, guide Ben was exceptional' },
    { guest:'Jackson E', quote:'10/10 reset — peace real, views unreal', highlight:'solo trip, zero stress, Jerry\'s warm welcome' },
    { guest:'Wisdom K',  quote:'Big Five sightings, luxurious accommodations, knowledgeable guides', highlight:'well-organized, every detail taken care of' }
  ],

  // ── NAMED GUIDES & STAFF ──────────────────────────────────────────────────────
  guides: ['Victor', 'Gumo', 'Peter', 'Ben', 'Simon'],
  staff:  ['Jerry', 'Jane'],
  lodges: ['Royal Mara Safari Lodge', 'Mara Serena Lodge', 'Four Points Hotel'],

  // ── HASHTAGS ─────────────────────────────────────────────────────────────────
  hashtags: {
    core:        ['#LavirasSafaris', '#LaviraKenya', '#KenyaSafari', '#AfricanSafari'],
    destinations:['#MasaiMara', '#Amboseli', '#TsavoNationalPark', '#Samburu', '#LakeNakuru', '#OlPejeta'],
    wildlife:    ['#BigFive', '#WildlifeKenya', '#WildebeestMigration', '#AfricanWildlife', '#SafariLife'],
    experience:  ['#VisitKenya', '#DiscoverAfrica', '#SafariSunset', '#BushLife', '#AfricaIsOpen'],
    adventure:   ['#HotAirBalloon', '#GameDrive', '#BirdWatching', '#MaasaiCulture', '#AfricaAdventure'],
    all() { return [...this.core, ...this.destinations, ...this.wildlife, ...this.experience]; }
  },

  // ── CONTENT THEMES (for scheduler rotation) ───────────────────────────────────
  content_themes: [
    'wildlife_spotlight',   // Feature one animal with facts
    'destination_profile',  // Showcase a park/reserve
    'guest_testimonial',    // Share a real review
    'safari_package_promo', // Promote a specific itinerary
    'behind_the_scenes',    // Guides, vehicles, camp life
    'conservation',         // Eco and community message
    'travel_tips',          // Packing, best time to visit
    'sunrise_sunset',       // Golden hour in the bush
    'cultural_moment',      // Maasai, Samburu culture
    'adventure_activity'    // Balloon, hiking, boat ride
  ],

  // ── PEXELS SEARCH TERMS (for zero-media promo) ───────────────────────────────
  pexels_queries: {
    'Masai Mara':    ['masai mara safari', 'wildebeest migration kenya', 'african savanna lion'],
    'Amboseli':      ['amboseli elephant kilimanjaro', 'elephant africa mountain', 'kenya elephant herd'],
    'Tsavo East':    ['tsavo kenya elephant', 'african elephant waterhole', 'kenya national park'],
    'Samburu':       ['samburu kenya wildlife', 'reticulated giraffe kenya', 'northern kenya safari'],
    'Lake Nakuru':   ['lake nakuru flamingos', 'pink flamingos kenya', 'rift valley kenya'],
    'Ol Pejeta':     ['kenya rhino conservation', 'black rhino africa', 'ol pejeta conservancy'],
    'Tanzania':      ['serengeti safari', 'ngorongoro crater', 'tanzania wildlife'],
    'Lake Naivasha': ['lake naivasha kenya', 'hippo kenya lake', 'hell\'s gate cycling kenya'],
    'Diani Beach':   ['diani beach kenya', 'kenya coast ocean', 'indian ocean kenya'],
    'default':       ['african safari sunset', 'kenya wildlife game drive', 'africa nature landscape']
  }
};

module.exports = BRAND;
