// Plan data for the unit-types 3D view (residence-prime) — see ../index.ts.
//
// Traced Nov 2026 from the three floor-plan images the sales team supplied
// (G 1670×602, 1st 1666×540, 2nd 1667×543 px). Each floor is written in its
// own image's pixels; `map` lines the three up on the lift shaft, which is
// the one thing drawn identically on all of them. The 1st-floor image is
// the type's frame. 66 px to the metre, from the room areas in the admin.
//
// Room names follow the admin's English names where they are the same room
// (components/unit-types/match-room.ts matches on them), not the brochure's.

import type { ProjectDef, FloorDef, Rect, Seg } from '../types';

const S = 1 / 66;
// The lift shaft's outer box on each image, and the stair well around it.
const LIFT_G: Rect = [875, 354, 1038, 500], CORE_G: Rect = [800, 288, 1121, 500];
const LIFT_1: Rect = [862, 291, 1027, 437], CORE_1: Rect = [787, 215, 1111, 437];
const LIFT_2: Rect = [860, 299, 1027, 445];
// The south side is the wall shared with the next house: `party`, so it is
// a full wall from above and from inside, and drops to cutaway height when
// the camera looks from that side (the overview and eye-level views do).
const PARTY_G: Seg = [35, 591, 1640, 591], PARTY_1: Seg = [62, 530, 1650, 530], PARTY_2: Seg = [60, 533, 1600, 533];

const floors: FloorDef[] = [
 { name:'Ground Floor', short:'G', area:175.06,
   map:{ s:S, from:[LIFT_G[0],LIFT_G[1]], to:[LIFT_1[0],LIFT_1[1]] },
   rooms:[
    {n:1,name:'Terrace',sqm:14.6,r:[[125,88,205,372],[35,372,205,583]],k:'out',lab:[120,470]},
    {n:2,name:'Studio Room',sqm:17,r:[[205,88,478,372]],k:'in'},
    {n:3,name:'Bathroom 1',sqm:9.44,r:[[478,88,792,186],[478,186,577,272]],k:'in',lab:[620,135]},
    {n:4,name:'Living · Dining · Kitchen',sqm:27.55,r:[[205,372,652,583],[478,272,652,372],[577,186,652,272],[652,278,697,500],[652,500,800,583]],k:'in',lab:[400,480]},
    {n:5,name:'Wine Room',sqm:4.59,r:[[697,278,797,500]],k:'in'},
    {n:6,name:'Pump Room & Laundry Room',sqm:15.14,r:[[800,88,1121,272]],k:'in'},
    {n:7,name:'Restroom',sqm:2.2,r:[[652,190,792,272]],k:'in'},
    {n:8,name:'Hallway',sqm:6.1,r:[[800,500,1121,583]],k:'in'},
    {n:9,name:'Store',sqm:5.2,r:[[960,288,1121,354],[1038,354,1121,500]],k:'in',lab:[1080,400]},
    {n:10,name:'Stair & Lift',sqm:10.4,r:[[800,288,960,354],[800,354,875,500],[875,354,1038,500]],k:'in',lab:[956,430]},
    {n:11,name:'Garbage Room',sqm:7.5,r:[[1128,8,1262,290]],k:'out'},
    {n:12,name:'Parking · 2 cars',sqm:47.84,r:[[1266,8,1640,583]],k:'park',lab:[1450,400]},
   ],
   greens:[[1128,290,1262,480]], slabs:[[1128,480,1262,583]],
   walls:[
    // shell. Doors are the gaps: pump room from the lawn (830–890 on the
    // north wall), laundry from the service yard (88–140 on the east wall),
    // the front door (500–583 on the east wall).
    [125,80,800,80],[800,74,830,74],[890,74,915,74],[1124,140,1124,272],[1124,440,1124,500],
    // studio, its closet and the TV wall
    [175,272,218,272],[175,272,175,375],[175,375,330,375],[478,80,478,170],[478,272,478,375],[428,372,478,372],
    // bathroom 1 (sliding door from the studio at x 478, 170–272) and the
    // restroom (door on its west wall, 190–245)
    [478,272,577,272],[577,186,577,272],[652,186,795,186],[652,245,652,275],[652,275,795,275],[795,80,795,278],
    // kitchen run, wine room (door on its south side, 745–797), core
    [697,278,697,500],[800,278,800,500],[800,278,1124,278],[910,74,910,272],
    // service yard and the slatted screen beside the carport
    [1118,8,1262,8],[1262,8,1262,70],[1190,80,1262,80],[1215,185,1262,185],[1215,285,1262,285],[1215,185,1215,285],[1262,185,1262,285],
    [1266,200,1545,200],
   ],
   glass:[[205,88,205,272],[205,378,205,583],[1118,290,1118,440],[577,186,652,186],[697,495,745,495],[915,74,1118,74]],
   party:[PARTY_G],
   build:(h)=>{
     // studio
     h.F(215,84,470,100,.15,1.2);h.F(245,105,385,250,.15,.7);h.F(430,270,476,372,.15,2.2);h.F(222,352,330,366,.15,1.6);
     // bathroom 1, restroom
     h.cyl(648,150,.8,.38,.15,.7);h.F(535,205,570,240,.15,.9);h.F(742,222,768,268,.15,.55);
     // living, island, kitchen run
     h.F(215,525,400,575,.15,.6);h.F(215,470,280,525,.15,.6);h.cyl(320,462,.5,.5,.15,.5);
     h.F(480,290,530,490,.15,1.0);h.F(655,282,695,495,.15,.95);
     // wine room, laundry
     h.F(700,280,795,318,.15,2.0);h.F(762,318,795,490,.15,2.0);h.F(915,220,1120,270,.15,1.0);
     h.ustair(CORE_G,LIFT_G);h.lift(LIFT_G,true);
     h.tree(70,530,1.2);
     h.car(1320,255,1610,360);h.car(1315,425,1600,535);
     for(let i=0;i<5;i++){const y=293+i*38;h.F(1140,y,1195,y+26,0,.06);}
   }},
 { name:'1st Floor', short:'1', area:164.01,
   rooms:[
    {n:1,name:'Living Room',sqm:27.4,r:[[455,208,787,523],[787,440,1113,523]],k:'in',lab:[620,400]},
    {n:2,name:'Kitchen & Dining Area',sqm:37.55,r:[[125,208,455,523],[172,20,455,208]],k:'in',lab:[400,300]},
    {n:3,name:'Terrace',sqm:1.4,r:[[125,20,172,205]],k:'out'},
    {n:4,name:'Swimming Pool',sqm:31.5,r:[[492,20,1118,188],[1118,20,1455,135]],k:'pool',lab:[800,105]},
    {n:5,name:'Restroom',sqm:1.75,r:[[1460,395,1580,523]],k:'in'},
    {n:6,name:'Pool Terrace',sqm:25.5,r:[[1255,135,1458,523],[1118,378,1255,523]],k:'out',lab:[1350,300]},
    {n:7,name:'Garden',sqm:9.06,r:[[1462,150,1650,380]],k:'green'},
   ],
   slabs:[[787,215,1113,440],[1468,20,1528,135]], greens:[[1118,135,1212,218],[55,20,122,205]],
   voids:[[62,208,122,523],[1118,220,1250,378]],
   walls:[
    [92,8,1118,8],[122,205,122,523],[122,205,185,205],[455,212,500,212],[787,215,787,437],
    [1113,378,1113,445],[1212,135,1255,135],[1212,135,1212,215],[1255,135,1255,215],[1212,215,1255,215],[1250,465,1250,523],
    // the two fin walls of the street frame, and the restroom behind it
    [1455,145,1650,145],[1455,387,1650,387],[1582,387,1582,523],[1458,447,1458,523],
   ],
   glass:[[500,208,787,208],[787,212,1113,212],[172,20,172,200],[462,20,462,205],[1113,218,1113,378]],
   party:[PARTY_1],
   rails:[[492,14,1455,14],[1455,20,1455,135],[62,208,122,208],[1118,378,1250,378],[1250,220,1250,378]],
   build:(h)=>{
     // island and its six chairs, pantry wall, back counter
     h.F(282,118,350,400,.05,.95);
     for(let i=0;i<3;i++){const y=128+i*58;h.F(250,y,280,y+46,.05,.75);h.F(352,y,382,y+46,.05,.75);}
     h.F(128,212,186,330,.05,2.1);h.F(128,330,186,520,.05,.95);h.F(205,482,385,520,.05,.95);
     // sofa, table, TV console
     h.F(500,225,780,300,.05,.7);h.F(500,300,566,360,.05,.7);h.F(700,300,780,362,.05,.7);
     h.cyl(655,372,.45,.45,.05,.45);h.F(530,505,750,520,.05,.6);
     // pool terrace: dining table, counter; garden sofa
     h.F(1253,242,1300,357,.05,.78);h.F(1250,487,1450,520,.05,.9);h.F(1465,170,1525,372,.05,.7);h.F(1465,480,1500,512,.05,.5);
     h.ustair(CORE_1,LIFT_1);h.lift(LIFT_1,false);
     h.tree(88,95,1.0);h.tree(1165,175,.8);h.tree(1560,290,1.2);h.tree(1560,70,.7);
   }},
 { name:'2nd Floor', short:'2', area:106.88,
   map:{ s:S, from:[LIFT_2[0],LIFT_2[1]], to:[LIFT_1[0],LIFT_1[1]] },
   rooms:[
    {n:1,name:'Guest Room',sqm:21.57,r:[[1207,137,1455,530],[1112,385,1207,530]],k:'in',lab:[1290,440]},
    {n:2,name:'Bathroom 2',sqm:8.2,r:[[1207,12,1538,132]],k:'in'},
    {n:3,name:'Master Bedroom',sqm:28.52,r:[[186,20,500,305],[246,305,500,530]],k:'in',lab:[340,200]},
    {n:4,name:'Bathroom 3',sqm:10.45,r:[[60,135,183,405],[100,405,246,530],[183,311,246,405]],k:'in',lab:[120,330]},
    {n:5,name:'Hall',sqm:15.24,r:[[500,432,785,530],[785,445,1105,530]],k:'in',lab:[700,485]},
    {n:6,name:'Terrace',sqm:2.05,r:[[1460,395,1540,527]],k:'green'},
   ],
   slabs:[[785,220,1105,445]],
   voids:[[503,22,1100,205],[503,215,783,430],[1115,25,1205,380],[1460,150,1538,378]],
   walls:[
    [95,5,560,5],[1100,5,1540,5],
    // bathroom 3 (sliding door from the bedroom at x 183, 262–305; open to
    // the dressing area below) and the master's TV and wardrobe walls. The
    // master's own door is the gap at x 502, 420–530.
    [57,132,186,132],[57,132,57,408],[57,408,100,408],[100,408,100,530],[183,132,183,262],[170,308,398,308],[243,308,243,385],[502,205,502,420],
    // core, guest room (door at x 1106, 448–530), bathroom 2 (sliding door
    // on the guest side, 1255–1330)
    [785,220,785,440],[1106,135,1106,448],[1207,137,1207,175],[1207,137,1255,137],[1207,175,1255,175],[1255,137,1255,175],[1330,137,1455,137],[1540,5,1540,137],[1540,392,1540,530],
    // fin walls of the street frame
    [1455,142,1650,142],[1455,387,1650,387],
   ],
   // the slatted screen on the side façade, above the pool
   louvers:[[503,16,1100,16]],
   glass:[[503,210,1100,210],[181,20,181,128],[502,20,502,205],[1207,20,1207,137],[1207,178,1207,380],[1112,382,1207,382],[1457,150,1457,380],[1457,395,1457,527]],
   party:[PARTY_2],
   rails:[[503,432,783,432]],
   build:(h)=>{
     // master: bed, wardrobes
     h.F(186,10,500,22,.05,1.2);h.F(250,55,400,165,.05,.6);h.F(455,212,498,420,.05,2.2);h.F(250,310,398,350,.05,2.2);h.F(248,485,395,522,.05,1.0);
     // bathroom 3
     h.cyl(93,320,.4,.85,.05,.6);h.F(100,485,240,522,.05,.9);h.F(190,322,220,372,.05,.5);
     // bathroom 2
     h.cyl(1498,68,.42,.8,.05,.6);h.F(1350,88,1378,130,.05,.5);h.F(1245,60,1275,95,.05,.9);
     // guest: wardrobe, desk, bed
     h.F(1335,142,1450,185,.05,2.2);h.F(1295,250,1450,282,.05,.75);h.F(1310,285,1430,400,.05,.6);
     h.lift(LIFT_2,false);
   }},
];

const project: ProjectDef = {
  id: 'residence-prime',
  name: 'The Residence Prime',
  floorsNote: '3 floors. Press a floor, then tap a room.',
  types: [
    { key: 'R', name: 'Type R', bed: 3, bath: 3, total: 446, scale: S, ext: [23, -60, 1658, 540], floors },
  ],
};
export default project;
