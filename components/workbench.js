'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import AmapMap from './amap-map';
import { filterOutExistingTenants } from '@/lib/merchant-dedup.mjs';
import { assessRentSales, buildTenantBenchmark, rentSalesThreshold } from '@/lib/analysis-report.mjs';
import { buildSupplementReport, parseAnalysisSupplementRows } from '@/lib/analysis-supplement.mjs';
import { reportLines } from '@/lib/pdf-report.mjs';
import { readXlsxRows } from '@/lib/xlsx-reader.mjs';
import {
  Bell, BookmarkCheck, BookmarkPlus, Building2, ChartNoAxesCombined, CircleCheck, ClipboardCheck,
  Columns3, Database, Download, FileDown, FileSpreadsheet, History, MapPinned, Menu,
  Plus, RotateCcw, Save, ScanSearch, Search, SlidersHorizontal,
  Sparkles, Store, Trash2, Upload, UserRound, Users, X
} from 'lucide-react';

const merchants = [
  ['老乡鸡','餐饮','快餐','B1',32,180,510,112,8.6],['麦当劳','餐饮','快餐','1F',35,220,680,145,13.2],
  ['吉野家','餐饮','快餐','B1',38,120,390,82,7.1],['赛百味','餐饮','快餐','1F',42,75,260,58,5.2],
  ['西贝莜面村','餐饮','正餐','2F',86,320,330,176,17.6],['云海肴','餐饮','正餐','2F',92,280,300,165,16.1],
  ['海底捞','餐饮','正餐','3F',128,450,420,260,24.8],['喜家德','餐饮','快餐','B1',40,130,360,78,7.5],
  ['永和大王','餐饮','快餐','B1',30,140,450,88,7.8],['陈香贵','餐饮','快餐','B1',39,115,410,80,7.2],
  ['Wagas','餐饮','商务餐','1F',75,160,280,126,11.8],['食其家','餐饮','快餐','B1',36,95,370,73,6.4],
  ['达美乐披萨','餐饮','快餐','1F',65,110,250,92,8.1],['小杨生煎','餐饮','快餐','B1',28,90,440,76,6.2],
  ['很久以前羊肉串','餐饮','正餐','3F',105,300,310,172,16.8],['星巴克','餐饮','饮品','1F',39,110,350,110,10.6],
  ['瑞幸咖啡','餐饮','饮品','B1',22,65,520,90,5.6],['喜茶','餐饮','饮品','1F',28,80,480,104,8.3],
  ['奈雪的茶','餐饮','烘焙','1F',30,95,420,102,9.1],['霸王茶姬','餐饮','饮品','B1',25,70,500,98,6.9],
  ['乐刻健身','休闲娱乐','休闲娱乐','4F',129,450,190,55,13.5],['威尔仕健身','休闲娱乐','休闲娱乐','4F',399,1200,260,98,28.6],
  ['一兆韦德','休闲娱乐','休闲娱乐','5F',329,1000,230,82,24.2],['名创优品','零售','零售','2F',45,230,380,118,14.4],
  ['无印良品','零售','零售','2F',120,550,290,186,26.5]
].map((row,index)=>({id:index+1,name:row[0],group:row[1],subtype:row[2],floor:row[3],spend:row[4],area:row[5],daily:row[6],revenue:row[7],rent:row[8],status:'在营'}));

const candidates = {
  coffee:{name:'M Stand 咖啡',category:'精品咖啡',group:'餐饮',subtype:'饮品',price:'38 元',area:'85 ㎡',rent:'7.5 万元',score:82,verdict:'建议引入',risk:'关注同业竞争',summary:'能补充下午消费场景，客群匹配较高；建议用租金条件控制同业竞争风险。',bars:[['客群匹配',91],['业态互补',72],['消费时段',88],['租金承受',78],['竞争强度',58,true]],opportunity:'白领客群占比 73%，下午茶消费需求高于现有供给。',riskText:'楼内已有 5 家饮品店，需突出精品咖啡定位并避免同层重叠。'},
  food:{name:'和府捞面',category:'快餐简餐',group:'餐饮',subtype:'快餐',price:'46 元',area:'160 ㎡',rent:'11 万元',score:74,verdict:'条件引入',risk:'租金承压',summary:'午餐需求稳定，但面积和租金压力较高；建议优先谈判保底租金与营业额抽成组合。',bars:[['客群匹配',86],['业态互补',61],['消费时段',94],['租金承受',56,true],['竞争强度',63,true]],opportunity:'楼内企业员工超 6,000 人，工作日午餐存在稳定刚需。',riskText:'楼内快餐供给密集，需以高翻台率和差异化套餐争取份额。'},
  gym:{name:'超级猩猩',category:'运动健身',group:'休闲娱乐',subtype:'休闲娱乐',price:'89 元/次',area:'280 ㎡',rent:'15 万元',score:88,verdict:'优先引入',risk:'关注晚间客流',summary:'按次付费模式与楼内年轻白领高度匹配，可补充现有会籍制健身房。',bars:[['客群匹配',94],['业态互补',96],['消费时段',87],['租金承受',76],['竞争强度',92]],opportunity:'按次付费模式与楼内 3 家会籍制健身房形成明显互补。',riskText:'周末楼宇客流偏低，需核验品牌周末独立获客能力。'},
  arabica:{name:'% Arabica',category:'精品咖啡',group:'餐饮',subtype:'饮品',price:'42 元',area:'95 ㎡',rent:'8.2 万元',score:79,verdict:'建议复核',risk:'品牌覆盖有限',summary:'品牌调性与楼宇白领客群匹配，但周边门店样本较少，建议先核验真实营收与开店条件。',bars:[['客群匹配',89],['业态互补',70],['消费时段',86],['租金承受',73],['竞争强度',57,true]],opportunity:'可强化精品咖啡供给，并提升首层公共空间的商务会客属性。',riskText:'当前使用模拟位置数据，正式决策前需通过高德门店数据和品牌访谈补充样本。'}
};

const businessCases = {
  coffee:{revenue:{low:31,base:38,high:45},grossMargin:68,fixedCost:15.6,rent:7.5,capex:68,breakeven:34,payback:18,rentBand:'6.8–8.2 万',confidence:78,range:'76–86',completeness:86,cannibalization:12,nearby:8},
  food:{revenue:{low:72,base:86,high:102},grossMargin:64,fixedCost:42.5,rent:11,capex:125,breakeven:83.6,payback:24,rentBand:'9.5–11.5 万',confidence:72,range:'68–80',completeness:81,cannibalization:18,nearby:21},
  gym:{revenue:{low:50,base:62,high:76},grossMargin:75,fixedCost:28.8,rent:15,capex:180,breakeven:58.4,payback:25,rentBand:'13.5–16.0 万',confidence:81,range:'84–92',completeness:89,cannibalization:6,nearby:5},
  arabica:{revenue:{low:30,base:37,high:44},grossMargin:69,fixedCost:16.2,rent:8.2,capex:76,breakeven:35.4,payback:21,rentBand:'7.2–8.6 万',confidence:69,range:'73–85',completeness:74,cannibalization:10,nearby:6}
};

const locations = [
  {id:'ms-finance',key:'coffee',merchant:'M Stand 咖啡',branch:'金融中心店',group:'餐饮',subtype:'饮品',address:'金融街 18 号（模拟地址）',distance:320,rating:4.6,sales:'高',x:61,y:42,poiId:'mock-ms-001',lng:null,lat:null},
  {id:'ms-park',key:'coffee',merchant:'M Stand 咖啡',branch:'中央公园店',group:'餐饮',subtype:'饮品',address:'中央公园南路 9 号（模拟地址）',distance:850,rating:4.5,sales:'中高',x:34,y:24,poiId:'mock-ms-002',lng:null,lat:null},
  {id:'hf-center',key:'food',merchant:'和府捞面',branch:'商务中心店',group:'餐饮',subtype:'快餐',address:'商务大道 66 号（模拟地址）',distance:460,rating:4.4,sales:'高',x:44,y:66,poiId:'mock-hf-001',lng:null,lat:null},
  {id:'hf-east',key:'food',merchant:'和府捞面',branch:'东区广场店',group:'餐饮',subtype:'快餐',address:'东区广场 B1 层（模拟地址）',distance:1200,rating:4.3,sales:'中',x:79,y:72,poiId:'mock-hf-002',lng:null,lat:null},
  {id:'ss-river',key:'gym',merchant:'超级猩猩',branch:'滨江训练馆',group:'休闲娱乐',subtype:'休闲娱乐',address:'滨江路 21 号 3 层（模拟地址）',distance:680,rating:4.8,sales:'中高',x:70,y:34,poiId:'mock-ss-001',lng:null,lat:null},
  {id:'ss-north',key:'gym',merchant:'超级猩猩',branch:'北区训练馆',group:'休闲娱乐',subtype:'休闲娱乐',address:'北区商务街 8 号（模拟地址）',distance:1550,rating:4.7,sales:'中',x:23,y:80,poiId:'mock-ss-002',lng:null,lat:null},
  {id:'ar-gallery',key:'arabica',merchant:'% Arabica',branch:'城市画廊店',group:'餐饮',subtype:'饮品',address:'城市大道 36 号（模拟地址）',distance:540,rating:4.7,sales:'中高',x:67,y:61,poiId:'mock-ar-001',lng:null,lat:null},
  {id:'ar-river',key:'arabica',merchant:'% Arabica',branch:'滨水商业店',group:'餐饮',subtype:'饮品',address:'滨水路 88 号（模拟地址）',distance:1380,rating:4.6,sales:'中',x:82,y:28,poiId:'mock-ar-002',lng:null,lat:null}
];

const units = [
  {code:'1F-07',floor:'1F',area:72,rent:6.5,power:80,water:'有',exhaust:'无',gas:'无',hours:'07:00–23:00',delivery:'2026-09-01',fit:{coffee:94,food:52,gym:28,arabica:88}},
  {code:'1F-12',floor:'1F',area:96,rent:8.1,power:100,water:'有',exhaust:'无',gas:'无',hours:'07:00–23:00',delivery:'2026-10-15',fit:{coffee:89,food:61,gym:35,arabica:93}},
  {code:'B1-08',floor:'B1',area:168,rent:10.5,power:140,water:'有',exhaust:'有',gas:'有',hours:'06:00–24:00',delivery:'2026-09-20',fit:{coffee:70,food:92,gym:36,arabica:66}},
  {code:'2F-12',floor:'2F',area:230,rent:12.4,power:120,water:'有',exhaust:'预留',gas:'无',hours:'08:00–22:00',delivery:'2026-11-01',fit:{coffee:58,food:76,gym:72,arabica:55}},
  {code:'3F-06',floor:'3F',area:380,rent:19.5,power:220,water:'有',exhaust:'有',gas:'有',hours:'10:00–24:00',delivery:'2026-12-01',fit:{coffee:32,food:84,gym:64,arabica:30}},
  {code:'4F-02',floor:'4F',area:300,rent:14.8,power:160,water:'有',exhaust:'无',gas:'无',hours:'06:00–23:00',delivery:'2026-09-10',fit:{coffee:35,food:42,gym:96,arabica:38}}
];

const candidateWorkflow = {
  coffee:{source:'招商主管录入',stage:'商务谈判',owner:'李哲',next:'确认租金方案'},
  food:{source:'周边门店搜索',stage:'条件复核',owner:'王倩',next:'补充翻台数据'},
  gym:{source:'品牌主动接洽',stage:'尽调中',owner:'陈敏',next:'核验工程条件'},
  arabica:{source:'周边门店搜索',stage:'初步筛选',owner:'待分配',next:'联系品牌拓展负责人'}
};

const candidateProfiles = {
  coffee:{officeFit:'高',period:'工作日早间、下午茶',trafficDependency:'中',engineering:'需给排水，无需排烟燃气',conditions:['首年租售比控制在餐饮关注线以内','与楼内现有饮品品牌错层、错客群经营','品牌提供同类写字楼成熟门店数据']},
  food:{officeFit:'高',period:'工作日午餐',trafficDependency:'高',engineering:'需给排水、排烟及燃气条件',conditions:['核验午高峰翻台率与出餐能力','租金采用保底与营业额抽成组合测算','与现有快餐品牌形成品类和价格差异']},
  gym:{officeFit:'高',period:'工作日晚间、午休',trafficDependency:'中',engineering:'需核验承重、消防、淋浴与隔音',conditions:['证明周末独立获客能力','确认楼板承重、消防和噪声条件','设置会员预售与持续经营保障条款']},
  arabica:{officeFit:'中高',period:'工作日早间、商务会客',trafficDependency:'中高',engineering:'需给排水，无需燃气',conditions:['补充北京同类写字楼门店销售样本','优先选择首层可见铺位并复核租金','明确与楼内现有咖啡品牌的差异定位']}
};

const decisions = [
  ['超级猩猩',88,'尽调中','陈敏','4F-02','核验消防与承重报告','2026-08-15','进行中'],
  ['M Stand 咖啡',82,'商务谈判','李哲','1F-07','确认租金 7.5 万方案','2026-08-14','待决策'],
  ['和府捞面',74,'条件复核','王倩','B1-08','补充高峰期翻台数据','2026-08-18','待补充'],
  ['无印良品续租',79,'审批中','陈敏','2F-01','资产负责人审批','2026-08-13','待审批']
];

const navGroups = [
  {label:'工作台',items:[['analysis','招商分析',ScanSearch],['compare','商户搜索与对比',Columns3],['shortlist','候选商户库',BookmarkCheck],['merchants','楼内商户',Store],['units','可招商铺位',MapPinned],['audience','客群画像',Users],['operations','经营数据',ChartNoAxesCombined]]},
  {label:'管理',items:[['decisions','决策记录',ClipboardCheck],['import','数据导入',Database],['model','评分模型',SlidersHorizontal]]}
];

const meta = {
  analysis:['新商户适配分析','从候选商户库选择品牌，评估其与楼宇客群、业态结构及经营目标的匹配程度'],compare:['商户搜索与对比','搜索周边门店，将品牌加入候选库，或直接比较收益、风险、距离和铺位适配度'],shortlist:['候选商户库','管理招商团队已收藏的品牌，并继续分析、尽调和商务跟进'],
  merchants:['楼内商户','管理 25 家在营商户并查看楼宇业态结构'],units:['可招商铺位','根据面积、租金和工程条件匹配候选商户'],audience:['客群画像','形成招商所需的客群与消费场景基准'],
  operations:['经营数据','跟踪商户营收、坪效、租金和楼宇商业活跃度'],decisions:['决策记录','管理候选品牌从分析、尽调、谈判到审批的过程'],import:['数据导入','导入商户经营数据并映射到统一分析字段'],model:['评分模型','配置招商适配度计算权重和决策阈值']
};

const money = value => Number(value).toLocaleString('zh-CN',{maximumFractionDigits:1});
const CATEGORY_GROUPS = ['全部','餐饮','服务配套','零售','休闲娱乐'];
const CATEGORY_SUBTYPES = ['全部','商务餐','饮品','正餐','快餐','烘焙','服务配套','零售','休闲娱乐'];
const SUBTYPES_BY_GROUP = {全部:CATEGORY_SUBTYPES,餐饮:['全部','商务餐','饮品','正餐','快餐','烘焙'],服务配套:['全部','服务配套'],零售:['全部','零售'],休闲娱乐:['全部','休闲娱乐']};
const groupClass = group => group==='服务配套'?'service':group==='零售'?'retail':group==='休闲娱乐'?'leisure':'';
const BUILDING_ADDRESS = process.env.NEXT_PUBLIC_BUILDING_ADDRESS || '北京市海淀区中关村融科资讯中心';
const hasAmapConfig = Boolean(process.env.NEXT_PUBLIC_AMAP_KEY && process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE);
const amapTypes = {全部:'050000|060000|070000|080000',餐饮:'050000',服务配套:'070000',零售:'060000',休闲娱乐:'080000'};
const inferPoiCategory = poi => {
  const text=`${poi.name}${poi.type}`;
  if(/^08/.test(poi.typecode)||/健身|运动|瑜伽|游泳|影院|娱乐|KTV|台球/.test(text)) return {group:'休闲娱乐',subtype:'休闲娱乐'};
  if(/^07/.test(poi.typecode)||/美容|美发|洗衣|维修|摄影|服务/.test(text)) return {group:'服务配套',subtype:'服务配套'};
  if(/^06/.test(poi.typecode)||/商店|超市|便利店|零售|百货/.test(text)) return {group:'零售',subtype:'零售'};
  if(/面包|烘焙|蛋糕|西点/.test(text)) return {group:'餐饮',subtype:'烘焙'};
  if(/咖啡|茶饮|饮品|甜品|奶茶|果汁/.test(text)) return {group:'餐饮',subtype:'饮品'};
  if(/快餐|小吃|简餐|面馆|米粉|盖饭|汉堡|披萨/.test(text)) return {group:'餐饮',subtype:'快餐'};
  if(/商务餐|宴请|会所餐厅/.test(text)) return {group:'餐饮',subtype:'商务餐'};
  return {group:'餐饮',subtype:'正餐'};
};
const formatDistance = meters => meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${meters}m`;
const migrateSavedCategory = item => {
  if(item.group==='饮品') return {...item,group:'餐饮',subtype:item.subtype||'饮品'};
  if(item.group==='健身') return {...item,group:'休闲娱乐',subtype:'休闲娱乐'};
  if(item.group==='百货') return {...item,group:'零售',subtype:'零售'};
  if(!item.subtype) return {...item,subtype:item.group==='餐饮'?'正餐':item.group};
  return item;
};

export default function Workbench() {
  const pathname = usePathname();
  const router = useRouter();
  const route = pathname.split('/').filter(Boolean)[0] || 'analysis';
  const page = meta[route] ? route : 'analysis';
  const [mobileOpen,setMobileOpen] = useState(false);
  const [drawer,setDrawer] = useState(null);
  const [toast,setToast] = useState('');
  const toastTimer = useRef(null);
  const [candidateKey,setCandidateKey] = useState('coffee');
  const [analysisPoiId,setAnalysisPoiId] = useState(null);
  const [analysisSearch,setAnalysisSearch] = useState('');
  const [shortlistSearch,setShortlistSearch] = useState('');
  const [savedCandidateKeys,setSavedCandidateKeys] = useState(['coffee','food','gym']);
  const [savedPoiCandidates,setSavedPoiCandidates] = useState([]);
  const [shortlistReady,setShortlistReady] = useState(false);
  const [scenario,setScenario] = useState('base');
  const [compareSearch,setCompareSearch] = useState('');
  const [compareRadius,setCompareRadius] = useState(1000);
  const [compareGroup,setCompareGroup] = useState('全部');
  const [compareSubtype,setCompareSubtype] = useState('全部');
  const [selected,setSelected] = useState([]);
  const [amapMode,setAmapMode] = useState(hasAmapConfig?'connecting':'unavailable');
  const [amapCenter,setAmapCenter] = useState(null);
  const [liveLocations,setLiveLocations] = useState([]);
  const [amapError,setAmapError] = useState('');
  const [amapSearching,setAmapSearching] = useState(false);
  const [excludedTenantCount,setExcludedTenantCount] = useState(0);
  const [merchantSearch,setMerchantSearch] = useState('');
  const [merchantGroup,setMerchantGroup] = useState('全部');
  const [merchantSubtype,setMerchantSubtype] = useState('全部');
  const [merchantYear,setMerchantYear] = useState('2026');
  const [merchantMonth,setMerchantMonth] = useState('6');
  const [feishuStatus,setFeishuStatus] = useState(null);
  const [feishuChecking,setFeishuChecking] = useState(false);
  const [feishuSyncing,setFeishuSyncing] = useState(false);
  const [feishuResult,setFeishuResult] = useState(null);
  const [feishuRecords,setFeishuRecords] = useState(null);
  const [feishuDataState,setFeishuDataState] = useState('loading');
  const [feishuDataError,setFeishuDataError] = useState('');
  const [weights,setWeights] = useState({customer:26,complement:24,spend:16,time:12,competition:12,rent:10});
  const [searchPage,setSearchPage] = useState(1);
  const [pageInput,setPageInput] = useState('1');
  const [pageJumpEditing,setPageJumpEditing] = useState(false);
  const supplementFileInput = useRef(null);
  const [analysisSupplement,setAnalysisSupplement] = useState(null);
  const [analysisUploadState,setAnalysisUploadState] = useState('idle');
  const [analysisUploadError,setAnalysisUploadError] = useState('');
  const [supplementTarget,setSupplementTarget] = useState(null);
  const [reportGenerating,setReportGenerating] = useState(false);

  useEffect(()=>{
    try {
      const cached=sessionStorage.getItem('merchant-fit-analysis-supplement');
      if(cached){
        const parsed=JSON.parse(cached);
        if(parsed?.name){
          setAnalysisSupplement(parsed);
          setAnalysisUploadState('ready');
        }
      }
    } catch {
      sessionStorage.removeItem('merchant-fit-analysis-supplement');
    }
  },[]);
  const displayMerchants = useMemo(()=>{
    if(!Array.isArray(feishuRecords)) return [];
    return feishuRecords.map((record,index)=>{
      const source=record.sourceFields||{};
      const areaValue=source['实际使用面积']??source['签约面积']??source['可出租面积'];
      const area=areaValue==null?null:Number(String(areaValue).replace(/[,，㎡平方米]/g,''));
      const sales=merchantMonth==='all'?record.annualSales:record.monthlySales?.[Number(merchantMonth)-1];
      return {id:record.recordId||`feishu-${index}`,name:record.brand||record.brandAlias||`飞书商户 ${index+1}`,group:record.category||'未分类',subtype:record.subcategory||record.category||'未分类',floor:[record.floorArea,record.floor].filter(Boolean).join(' '),spend:null,area:Number.isFinite(area)?area:null,daily:null,revenue:Number.isFinite(sales)?sales:null,rent:null,status:record.leaseStatus||'在营'};
    }).filter(item=>item.name&&item.status!=='已退租'&&item.status!=='已撤场');
  },[feishuRecords,merchantMonth]);

  useEffect(()=>setMobileOpen(false),[pathname]);
  useEffect(()=>{
    if(page!=='import') return;
    let active=true;
    setFeishuChecking(true);
    fetch('/api/feishu?action=status',{cache:'no-store'})
      .then(response=>response.json())
      .then(data=>{if(active) setFeishuStatus(data);})
      .catch(()=>{if(active) setFeishuStatus({ok:false,configured:false,message:'暂时无法读取配置状态'});})
      .finally(()=>{if(active) setFeishuChecking(false);});
    return ()=>{active=false;};
  },[page]);
  useEffect(()=>{
    let active=true;
    setFeishuRecords(null);
    setFeishuDataState('loading');
    setFeishuDataError('');
    fetch(`/api/feishu?action=records&year=${merchantYear}`,{cache:'no-store'})
      .then(async response=>{
        const data=await response.json();
        if(!response.ok||!data.ok) throw new Error(data.message||'飞书数据读取失败');
        return data;
      })
      .then(data=>{
        if(active){
          setFeishuRecords(Array.isArray(data.records)?data.records:[]);
          setFeishuDataState('live');
        }
      })
      .catch(error=>{
        if(active){
          setFeishuRecords([]);
          setFeishuDataState('error');
          setFeishuDataError(error.message||'飞书数据读取失败');
        }
      });
    return ()=>{active=false;};
  },[merchantYear]);
  useEffect(()=>{
    try {
      const stored=JSON.parse(localStorage.getItem('merchant-fit-shortlist')||'null');
      if(Array.isArray(stored)) setSavedCandidateKeys(stored.filter(key=>candidates[key]));
      const storedPois=JSON.parse(localStorage.getItem('merchant-fit-poi-shortlist')||'null');
      if(Array.isArray(storedPois)) setSavedPoiCandidates(storedPois.map(migrateSavedCategory));
      const active=localStorage.getItem('merchant-fit-active-candidate');
      if(candidates[active]) setCandidateKey(active);
      const activePoi=localStorage.getItem('merchant-fit-active-poi');
      if(activePoi) setAnalysisPoiId(activePoi);
    } catch {}
    setShortlistReady(true);
  },[]);
  useEffect(()=>{
    if(shortlistReady) localStorage.setItem('merchant-fit-shortlist',JSON.stringify(savedCandidateKeys));
  },[savedCandidateKeys,shortlistReady]);
  useEffect(()=>{
    if(shortlistReady) localStorage.setItem('merchant-fit-poi-shortlist',JSON.stringify(savedPoiCandidates));
  },[savedPoiCandidates,shortlistReady]);
  useEffect(()=>{
    if(!hasAmapConfig) return;
    const controller=new AbortController();
    fetch(`/api/amap?action=geocode&address=${encodeURIComponent(BUILDING_ADDRESS)}`,{signal:controller.signal})
      .then(async response=>{const data=await response.json();if(!response.ok||!data.ok) throw new Error(data.message||'写字楼定位失败');return data;})
      .then(data=>{setAmapCenter([data.building.lng,data.building.lat]);setAmapMode('live');setSelected([]);})
      .catch(error=>{if(error.name!=='AbortError'){setAmapError(error.message);setAmapMode('unavailable');}});
    return ()=>controller.abort();
  },[]);
  useEffect(()=>{
    if(amapMode!=='live'||!amapCenter) return;
    const controller=new AbortController();
    const timer=setTimeout(()=>{
      setAmapSearching(true);
      const keyword=compareSearch.trim();
      const query=new URLSearchParams({action:'around',location:amapCenter.join(','),radius:String(compareRadius),keywords:keyword,types:amapTypes[compareGroup]||''});
      fetch(`/api/amap?${query}`,{signal:controller.signal})
        .then(async response=>{const data=await response.json();if(!response.ok||!data.ok) throw new Error(data.message||'周边商户搜索失败');return data;})
        .then(data=>{
          const externalPois=filterOutExistingTenants(data.pois,displayMerchants);
          setExcludedTenantCount(data.pois.length-externalPois.length);
          const items=externalPois.map(poi=>{const category=inferPoiCategory(poi);return {id:`amap-${poi.id}`,key:null,merchant:poi.name,branch:poi.mall?`${poi.mall}内`:'高德门店',mall:poi.mall||'',group:category.group,subtype:category.subtype,address:poi.address,distance:poi.distance,rating:poi.rating||'暂无',sales:poi.cost?`人均 ${poi.cost} 元`:'真实 POI',x:null,y:null,poiId:poi.id,lng:poi.lng,lat:poi.lat};});
          setLiveLocations(items.filter(item=>(compareGroup==='全部'||item.group===compareGroup)&&(compareSubtype==='全部'||item.subtype===compareSubtype)));
          setAmapError('');
        })
        .catch(error=>{if(error.name!=='AbortError'){setAmapError(error.message);setLiveLocations([]);setExcludedTenantCount(0);}})
        .finally(()=>setAmapSearching(false));
    },450);
    return ()=>{clearTimeout(timer);controller.abort();};
  },[amapCenter,amapMode,compareGroup,compareRadius,compareSearch,compareSubtype]);
  const notify = message => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current=setTimeout(()=>setToast(''),2200);
  };
  const renderReportImages = async report => {
    if(document.fonts?.ready) await document.fonts.ready;
    const lines=reportLines(report);
    const pageLines=31;
    const pages=[];
    for(let index=0;index<lines.length;index+=pageLines) pages.push(lines.slice(index,index+pageLines));
    return pages.map((currentPage,pageIndex)=>{
      const canvas=document.createElement('canvas');
      canvas.width=1190;
      canvas.height=1684;
      const context=canvas.getContext('2d');
      context.fillStyle='#ffffff';
      context.fillRect(0,0,canvas.width,canvas.height);
      context.fillStyle='#15252b';
      let y=82;
      currentPage.forEach(line=>{
        const size=Math.max(16,Math.round((line.size||11)*2.1));
        context.font=`${line.size>=14?'700':'400'} ${size}px "Microsoft YaHei", "Noto Sans CJK SC", "SimSun", sans-serif`;
        if(line.text) context.fillText(line.text,72,y);
        y+=Math.max(28,Math.round(size*1.55));
      });
      context.fillStyle='#75858a';
      context.font='18px "Microsoft YaHei", "Noto Sans CJK SC", "SimSun", sans-serif';
      context.fillText(`第 ${pageIndex+1} / ${pages.length} 页`,72,1618);
      return canvas.toDataURL('image/jpeg',0.92);
    });
  };
  const downloadAnalysisReport = async report => {
    if(reportGenerating) return;
    setReportGenerating(true);
    try {
      const payload={...report,generatedAt:new Date().toLocaleString('zh-CN',{hour12:false})};
      const images=await renderReportImages(payload);
      const response=await fetch('/api/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,images,imageWidth:1190,imageHeight:1684})});
      if(!response.ok) {
        const data=await response.json().catch(()=>({}));
        throw new Error(data.message||'PDF 报告生成失败');
      }
      const blob=await response.blob();
      const url=URL.createObjectURL(blob);
      const link=document.createElement('a');
      link.href=url;
      link.download=`${String(report.fileName||report.title||'招商分析报告').replace(/[\\/:*?"<>|]/g,'_')}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      notify('PDF 招商分析报告已下载');
    } catch(error) {
      notify(error.message||'PDF 报告生成失败');
    } finally {
      setReportGenerating(false);
    }
  };
  const reportButton = report => <button className="btn primary" disabled={reportGenerating} onClick={()=>downloadAnalysisReport(report)}><FileDown size={16}/>{reportGenerating?'生成中…':'生成 PDF 报告'}</button>;
  const selectCandidate = key => {
    setCandidateKey(key);
    setAnalysisPoiId(null);
    localStorage.setItem('merchant-fit-active-candidate',key);
    localStorage.removeItem('merchant-fit-active-poi');
  };
  const selectPoiCandidate = poiId => {
    setAnalysisPoiId(poiId);
    localStorage.setItem('merchant-fit-active-poi',poiId);
  };
  const saveCandidate = key => {
    if(savedCandidateKeys.includes(key)) return notify(`${candidates[key].name} 已在候选商户库中`);
    setSavedCandidateKeys(current=>[...current,key]);
    notify(`${candidates[key].name} 已加入候选商户库`);
  };
  const removeCandidate = key => {
    setSavedCandidateKeys(current=>current.filter(item=>item!==key));
    notify(`${candidates[key].name} 已移出候选商户库`);
  };
  const isLocationSaved = item => item.key ? savedCandidateKeys.includes(item.key) : savedPoiCandidates.some(poi=>poi.poiId===item.poiId);
  const saveLocationCandidate = item => {
    if(item.key) return saveCandidate(item.key);
    if(isLocationSaved(item)) return notify(`${item.merchant} 已在候选商户库中`);
    setSavedPoiCandidates(current=>[...current,{...item,source:'高德地图',stage:'待补充资料',owner:'待分配',next:'补充面积、租金与品牌联系人'}]);
    notify(`${item.merchant} 已加入候选商户库`);
  };
  const removePoiCandidate = poiId => {
    const item=savedPoiCandidates.find(poi=>poi.poiId===poiId);
    setSavedPoiCandidates(current=>current.filter(poi=>poi.poiId!==poiId));
    notify(`${item?.merchant||'商户'} 已移出候选商户库`);
  };

  const header = (actions=null) => <div className="page-head"><div><h1>{meta[page][0]}</h1><p className="page-subtitle">{meta[page][1]}</p></div>{actions&&<div className="page-actions">{actions}</div>}</div>;
  const bestUnits = key => [...units].sort((a,b)=>b.fit[key]-a.fit[key]);
  const caseMetrics = (key, selectedScenario=scenario) => {
    const item=businessCases[key]; const revenue=item.revenue[selectedScenario];
    return {revenue,profit:revenue*item.grossMargin/100-item.fixedCost-item.rent,rentSales:item.rent/revenue*100,payback:Math.max(12,Math.round(item.payback*item.revenue.base/revenue))};
  };
  const uploadAnalysisWorkbook = async event => {
    const file=event.target.files?.[0];
    event.target.value='';
    if(!file) return;
    setAnalysisUploadState('reading');
    setAnalysisUploadError('');
    try {
      const rows=await readXlsxRows(file);
      const parsed=parseAnalysisSupplementRows(rows);
      if(!parsed.valid) throw new Error(parsed.errors.join('；'));
      const supplement={...parsed.data,completeness:parsed.completeness,fileName:file.name,targetType:supplementTarget?.type||null,targetKey:supplementTarget?.key||null,targetPoiId:supplementTarget?.poiId||null};
      setAnalysisSupplement(supplement);
      sessionStorage.setItem('merchant-fit-analysis-supplement',JSON.stringify(supplement));
      setAnalysisUploadState('ready');
      notify(`${parsed.data.name} 的补充资料已生成分析报告`);
      if(supplementTarget?.type==='poi') selectPoiCandidate(supplementTarget.poiId);
      if(supplementTarget?.type==='candidate') selectCandidate(supplementTarget.key);
      setSupplementTarget(null);
      router.push('/analysis');
    } catch(error) {
      setAnalysisSupplement(null);
      sessionStorage.removeItem('merchant-fit-analysis-supplement');
      setAnalysisUploadState('error');
      setAnalysisUploadError(error.message||'Excel 读取失败');
    }
  };
  const clearAnalysisSupplement = () => {
    setAnalysisSupplement(null);
    setAnalysisUploadState('idle');
    setAnalysisUploadError('');
    sessionStorage.removeItem('merchant-fit-analysis-supplement');
    notify('已移除本次上传的补充资料');
  };
  const openSupplementDialog = target => {
    setAnalysisUploadState('idle');
    setAnalysisUploadError('');
    setSupplementTarget(target);
  };
  const supplementDialog = supplementTarget && <div className="drawer-backdrop supplement-backdrop" onClick={()=>setSupplementTarget(null)}><section className="drawer supplement-dialog" onClick={event=>event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="supplement-dialog-title"><div className="drawer-head"><div><h2 id="supplement-dialog-title">补充候选商户资料</h2><p className="page-subtitle">{supplementTarget.name}</p></div><button className="icon-btn" onClick={()=>setSupplementTarget(null)} aria-label="关闭"><X size={17}/></button></div><p className="supplement-dialog-intro">上传品牌经营与工程资料后，系统会自动回到招商分析页生成报告。文件只在当前浏览器中解析，不上传服务器，也不会修改飞书。</p><div className={`analysis-upload ${analysisUploadState==='error'?'error':''}`}><div className="analysis-upload-copy"><FileSpreadsheet size={19}/><div><strong>Excel 补充资料</strong><span>{analysisUploadState==='reading'?'正在校验 Excel...':'支持网站模板或已填写的 .xlsx 文件'}</span></div></div><div className="analysis-upload-actions"><a className="btn" href="/templates/候选商户补充分析资料模板.xlsx" download><Download size={15}/>空白模板</a><a className="btn" href="/templates/胖子龙虾·烧烤·小海鲜(中关村店)-补充分析资料示例.xlsx" download><FileSpreadsheet size={15}/>填写示例</a><button className="btn primary" onClick={()=>supplementFileInput.current?.click()} disabled={analysisUploadState==='reading'}><Upload size={15}/>{analysisUploadState==='reading'?'读取中':'选择 Excel'}</button><input ref={supplementFileInput} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={uploadAnalysisWorkbook} style={{display:'none'}}/></div>{analysisUploadError&&<p>{analysisUploadError}</p>}</div></section></div>;

  function AnalysisPage(){
    const selectedPoi=savedPoiCandidates.find(item=>item.poiId===analysisPoiId);
    const p=candidates[candidateKey], bc=businessCases[candidateKey], fm=caseMetrics(candidateKey), top=bestUnits(candidateKey).slice(0,3);
    const benchmark=buildTenantBenchmark(displayMerchants,p);
    const poiBenchmark=selectedPoi?buildTenantBenchmark(displayMerchants,selectedPoi):null;
    const threshold=rentSalesThreshold(p.group);
    const rentRisk=assessRentSales(p.group,fm.rentSales);
    const profile=candidateProfiles[candidateKey];
    const workflow=candidateWorkflow[candidateKey];
    const scenarioRows=[['low','保守'],['base','基准'],['high','乐观']].map(([key,label])=>({key,label,...caseMetrics(candidateKey,key)}));
    const dataPeriod=`${merchantYear}年${merchantMonth==='all'?'全年累计':`${merchantMonth}月`}`;
    const benchmarkStatus=feishuDataState==='loading'?'正在读取飞书数据':feishuDataState==='error'?'飞书数据暂不可用':`${dataPeriod} · 飞书只读`;
    const availableCandidates=savedCandidateKeys.filter(key=>candidates[key].name.toLowerCase().includes(analysisSearch.trim().toLowerCase()));
    const availablePoiCandidates=savedPoiCandidates.filter(item=>`${item.merchant}${item.address}${item.group}`.toLowerCase().includes(analysisSearch.trim().toLowerCase()));
    const supplementMatchesSelection=analysisSupplement&&(!analysisSupplement.targetType||(analysisSupplement.targetType==='candidate'&&!analysisPoiId&&analysisSupplement.targetKey===candidateKey)||(analysisSupplement.targetType==='poi'&&analysisSupplement.targetPoiId===analysisPoiId));
    if(supplementMatchesSelection){
      const uploadedBenchmark=buildTenantBenchmark(displayMerchants,analysisSupplement);
      const uploadedReport=buildSupplementReport(analysisSupplement,uploadedBenchmark);
      const activeScenario=uploadedReport.scenarios.find(item=>item.key===scenario)||uploadedReport.base;
      const scenarioLabels={low:'保守',base:'基准',high:'乐观'};
      const engineering=[['给排水',analysisSupplement.water],['排烟',analysisSupplement.exhaust],['燃气',analysisSupplement.gas],['电力',Number.isFinite(analysisSupplement.power)?`${analysisSupplement.power}kW`:null],['承重',Number.isFinite(analysisSupplement.loadBearing)?`${analysisSupplement.loadBearing}kg/㎡`:null]].filter(([,value])=>value);
      const uploadedPdfReport={fileName:`${analysisSupplement.name}-招商分析报告`,title:`${analysisSupplement.name} · 招商分析报告`,verdict:uploadedReport.verdict,score:uploadedReport.score,confidence:uploadedReport.confidence,summary:`基准月销售 ${money(analysisSupplement.revenueBase)} 万元，预计经营利润 ${money(uploadedReport.base.profit)} 万元，租售比 ${uploadedReport.base.rentSales.toFixed(1)}%。结论同时考虑楼内${analysisSupplement.subtype}供给、写字楼客流适配和品牌补充资料。`,facts:[['业态',`${analysisSupplement.group} · ${analysisSupplement.subtype}`],['所需面积',`${money(analysisSupplement.area)}㎡`],['报价月租金',`${money(analysisSupplement.rent)} 万元/月`],['盈亏平衡月销售',`${money(uploadedReport.breakeven)} 万元`],['数据完整度',`${analysisSupplement.completeness}%`],['楼内供给',`${uploadedBenchmark.subtypeCount} 家${analysisSupplement.subtype} · ${uploadedBenchmark.supply}`]],sections:[{title:'财务三情景',items:uploadedReport.scenarios.map(item=>`${scenarioLabels[item.key]}：月销售 ${money(item.revenue)} 万，经营利润 ${money(item.profit)} 万，租售比 ${item.rentSales.toFixed(1)}%，回收期 ${item.payback==null?'无法回收':`${money(item.payback)} 个月`}，${item.assessment.level}`)},{title:'经营与工程适配',items:[`工作日销售占比 ${Number.isFinite(analysisSupplement.weekdayShare)?`${analysisSupplement.weekdayShare}%`:'待补充'}，自然客流依赖 ${analysisSupplement.trafficDependency||'待补充'}`,engineering.length?engineering.map(([label,value])=>`${label}${value}`).join('；'):'工程条件待补充']},{title:'风险与招商条件',items:[...uploadedReport.risks,...uploadedReport.conditions]},{title:'审批行动',items:['核验 Excel 经营数据与品牌门店凭证','匹配铺位并完成工程踏勘','按租售比阈值谈判租金','提交最终招商审批']}],source:`候选经营与工程资料来自 Excel；楼内商户与销售来自飞书只读同步（${dataPeriod}）；周边位置由高德地图提供。`};
      return <>{header(<><span className="badge">Excel 已校验</span>{reportButton(uploadedPdfReport)}<button className="btn" onClick={clearAnalysisSupplement}><Trash2 size={15}/>移除资料</button></>)}
        <div className="analysis-grid"><div className="grid"><section className="panel"><div className="panel-head"><div><h2>分析资料</h2><p className="page-subtitle">{analysisSupplement.fileName}</p></div><span className="badge blue">截止 {analysisSupplement.asOfDate}</span></div><div className="form-row"><label className="field"><span className="field-label">候选商户</span><input className="form-control" value={analysisSupplement.name} readOnly/></label><label className="field"><span className="field-label">业态</span><input className="form-control" value={`${analysisSupplement.group} · ${analysisSupplement.subtype}`} readOnly/></label><label className="field"><span className="field-label">所需面积</span><input className="form-control" value={`${money(analysisSupplement.area)}㎡`} readOnly/></label><label className="field"><span className="field-label">品牌联系人</span><input className="form-control" value={analysisSupplement.contact} readOnly/></label></div></section>
          <section className="panel"><div className="panel-head"><h2>楼内真实基准</h2><span className="panel-note">{benchmarkStatus}</span></div>{feishuDataState==='live'?<div className="grid two"><Metric label="在营商户" value={`${uploadedBenchmark.totalCount} 家`} note={`${analysisSupplement.group} ${uploadedBenchmark.categoryCount} 家`}/><Metric label={analysisSupplement.subtype} value={`${uploadedBenchmark.subtypeCount} 家`} note={uploadedBenchmark.supply}/><Metric label="同业销售中位数" value={uploadedBenchmark.medianSales==null?'样本不足':`${money(uploadedBenchmark.medianSales)} 万`} note={dataPeriod}/><Metric label="同业平均坪效" value={uploadedBenchmark.averageEfficiency==null?'样本不足':`${money(uploadedBenchmark.averageEfficiency)} 元/㎡`} note={`${uploadedBenchmark.efficiencyCount} 家可计算`}/></div>:<div className="integration-notice"><strong>{benchmarkStatus}</strong><span>{feishuDataError||'飞书加载完成后自动补入供需与分流判断。'}</span></div>}</section></div>
          <section className="panel"><div className="result-head"><div className="score-wrap"><div className="score-ring" style={{'--score':uploadedReport.score}}><span>{uploadedReport.score}</span></div><div><h2>{analysisSupplement.name} · 自动分析结论</h2><div className="badge-row"><span className={`badge ${uploadedReport.verdict.includes('不建议')?'warn':''}`}><CircleCheck size={14}/>{uploadedReport.verdict}</span><span className="badge blue">可信度 {uploadedReport.confidence}%</span><span className="badge blue">完整字段 {analysisSupplement.completeness}%</span></div><p className="summary">基准月销售 {money(analysisSupplement.revenueBase)} 万元，预计经营利润 {money(uploadedReport.base.profit)} 万元，租售比 {uploadedReport.base.rentSales.toFixed(1)}%。结论同时考虑楼内{analysisSupplement.subtype}供给、写字楼客流适配和品牌补充资料。</p></div></div><span className="panel-note">Excel 真实补充资料</span></div>
            <div className="section"><div className="decision-grid"><div className="decision"><h3>主要机会</h3><p>{uploadedBenchmark.supply==='业态空缺'||uploadedBenchmark.supply==='供给偏少'?`楼内${analysisSupplement.subtype}${uploadedBenchmark.supply}，具有业态补位价值。`:`楼内${analysisSupplement.subtype}${uploadedBenchmark.supply}，需依靠差异化争取增量。`} {analysisSupplement.differentiation||'建议继续补充品牌差异化定位。'}</p></div><div className="decision risk"><h3>首要风险</h3><p>{uploadedReport.risks[0]}</p></div></div></div></section></div>
        <div className="grid two" style={{marginTop:16}}><section className="panel"><div className="panel-head"><div><h2>招商财务测算</h2><p className="page-subtitle">Excel 上传数据 · 万元/月</p></div><div className="scenario-switch">{[['low','保守'],['base','基准'],['high','乐观']].map(([key,label])=><button key={key} className={`chip ${scenario===key?'active':''}`} onClick={()=>setScenario(key)}>{label}</button>)}</div></div><div className="grid four"><Metric label="月销售" value={money(activeScenario.revenue)} note={`${scenarioLabels[activeScenario.key]}情景`}/><Metric label="经营利润" value={`${money(activeScenario.profit)} 万`} note={`毛利率 ${analysisSupplement.grossMargin}%`} warn={activeScenario.profit<=0}/><Metric label="租售比" value={`${activeScenario.rentSales.toFixed(1)}%`} note={activeScenario.assessment.level} warn={activeScenario.assessment.level!=='可接受'}/><Metric label="回收期" value={activeScenario.payback==null?'无法回收':`${money(activeScenario.payback)} 月`} note={`投入 ${money(analysisSupplement.capex)} 万`} warn={activeScenario.payback==null}/></div><div className="section"><table><tbody><tr><td>盈亏平衡月销售</td><td className="num">{money(uploadedReport.breakeven)} 万</td></tr><tr><td>报价月租金</td><td className="num">{money(analysisSupplement.rent)} 万</td></tr><tr><td>业态租售比关注线</td><td className="num">{uploadedReport.threshold.watch}%</td></tr></tbody></table></div></section>
          <section className="panel"><div className="panel-head"><h2>经营与工程适配</h2><span className="panel-note">品牌补充资料</span></div><div className="signal-list"><div className="signal-row"><span>工作日销售占比</span><strong>{Number.isFinite(analysisSupplement.weekdayShare)?`${analysisSupplement.weekdayShare}%`:'待补充'}</strong></div><div className="signal-row"><span>自然客流依赖</span><strong>{analysisSupplement.trafficDependency||'待补充'}</strong></div><div className="signal-row"><span>写字楼成熟门店</span><strong>{Number.isFinite(analysisSupplement.officeStoreCount)?`${analysisSupplement.officeStoreCount} 家`:'待补充'}</strong></div><div className="signal-row"><span>预计分流</span><strong>{Number.isFinite(analysisSupplement.cannibalization)?`${analysisSupplement.cannibalization}%`:'待测算'}</strong></div></div><div className="engineering-tags">{engineering.length?engineering.map(([label,value])=><span key={label}>{label}：{value}</span>):<span>工程条件待补充</span>}</div></section></div>
        <section className="panel report-section" style={{marginTop:16}}><div className="panel-head"><div><h2>{analysisSupplement.name} · 招商分析报告</h2><p className="page-subtitle">由 Excel 补充资料、飞书楼内数据和招商规则自动生成</p></div><span className={`badge ${uploadedReport.verdict.includes('不建议')?'warn':''}`}>{uploadedReport.verdict}</span></div>
          <div className="section"><div className="section-title"><h3>财务三情景</h3><span className="panel-note">报价租金 {money(analysisSupplement.rent)} 万元/月</span></div><div className="table-wrap"><table className="scenario-table"><thead><tr><th>情景</th><th className="num">月销售</th><th className="num">经营利润</th><th className="num">租售比</th><th className="num">回收期</th><th>判断</th></tr></thead><tbody>{uploadedReport.scenarios.map(item=><tr key={item.key} className={scenario===item.key?'selected-row':''}><td><b>{scenarioLabels[item.key]}</b></td><td className="num">{money(item.revenue)} 万</td><td className="num">{money(item.profit)} 万</td><td className="num">{item.rentSales.toFixed(1)}%</td><td className="num">{item.payback==null?'无法回收':`${money(item.payback)} 月`}</td><td><span className={`badge ${item.assessment.level==='可接受'?'':'warn'}`}>{item.assessment.level}</span></td></tr>)}</tbody></table></div></div>
          <div className="report-grid section"><div className="report-block"><h3>楼内供需判断</h3><p>{feishuDataState==='live'?`在营 ${uploadedBenchmark.totalCount} 家，${analysisSupplement.group} ${uploadedBenchmark.categoryCount} 家，${analysisSupplement.subtype} ${uploadedBenchmark.subtypeCount} 家，当前为“${uploadedBenchmark.supply}”。`:'飞书楼内数据暂不可用，供需判断将在同步恢复后自动补全。'}</p></div><div className="report-block"><h3>写字楼适配</h3><p>工作日销售占比{Number.isFinite(analysisSupplement.weekdayShare)?` ${analysisSupplement.weekdayShare}%`:'待补充'}，自然客流依赖{analysisSupplement.trafficDependency||'待补充'}，周末独立获客能力{analysisSupplement.weekendAcquisition||'待补充'}。</p></div><div className="report-block"><h3>工程可实施性</h3><p>{engineering.length?engineering.map(([label,value])=>`${label}${value}`).join('；'):'给排水、排烟、燃气、电力和承重条件仍需补充'}。{analysisSupplement.fireSafety&&`消防要求：${analysisSupplement.fireSafety}。`}</p></div><div className="report-block risk"><h3>竞争与风险</h3><p>{uploadedReport.risks.join('；')}。{analysisSupplement.competition&&`周边竞争：${analysisSupplement.competition}`}</p></div></div>
          <div className="section"><div className="section-title"><h3>招商条件</h3><span className="panel-note">联系人：{analysisSupplement.contact}{analysisSupplement.phone?` · ${analysisSupplement.phone}`:''}</span></div><div className="condition-list">{uploadedReport.conditions.map(item=><div key={item}><CircleCheck size={15}/><span>{item}</span></div>)}</div></div>
          <div className="section"><div className="section-title"><h3>审批行动清单</h3><span className="panel-note">数据截止 {analysisSupplement.asOfDate}</span></div><div className="table-wrap"><table className="action-table"><thead><tr><th>顺序</th><th>动作</th><th>负责人</th><th>截止时间</th><th>审批输出</th></tr></thead><tbody><tr><td>1</td><td>核验 Excel 经营数据与品牌门店凭证</td><td>{analysisSupplement.contact}</td><td>2 个工作日内</td><td>确认销售、毛利和成本口径</td></tr><tr><td>2</td><td>匹配铺位并完成工程踏勘</td><td>招商与工程</td><td>数据核验后 2 日</td><td>确认面积、改造条件和预算</td></tr><tr><td>3</td><td>按租售比阈值谈判租金</td><td>招商负责人</td><td>踏勘通过后 5 日</td><td>形成租金、免租及保护条款</td></tr><tr><td>4</td><td>提交最终招商审批</td><td>审批负责人</td><td>谈判完成后 1 日</td><td>附财务、分流、工程和风险结论</td></tr></tbody></table></div></div>
          <div className="report-source"><strong>数据来源与安全</strong><span>候选经营与工程资料来自本次 Excel 文件；楼内商户与销售来自飞书只读同步（{dataPeriod}）；周边位置由高德地图提供。Excel 仅在当前浏览器解析，不上传服务器、不修改飞书字段。</span></div></section></>;
    }
    if(selectedPoi) {
      const poiPdfReport={fileName:`${selectedPoi.merchant}-招商初审报告`,title:`${selectedPoi.merchant} · 招商初审报告`,verdict:'资料准备中',summary:`位置与业态信息已具备，可进入品牌接洽；因缺少租金、营收、成本、面积和工程条件，当前不能判断盈利能力。`,facts:[['业态',`${selectedPoi.group} · ${selectedPoi.subtype||selectedPoi.group}`],['高德评分',selectedPoi.rating||'暂无'],['距写字楼',formatDistance(selectedPoi.distance)],['楼内同细分供给',`${poiBenchmark.subtypeCount} 家 · ${poiBenchmark.supply}`]],sections:[{title:'写字楼适配',items:['优先核验工作日客流、午间或晚间高峰经营能力','确认品牌是否依赖购物中心周末自然客流']},{title:'风险与决策缺口',items:['尚不能计算月销售、租售比、盈亏平衡、回收期和同业分流','补齐品牌经营样本、所需面积、报价租金、毛利和固定成本']},{title:'下一步招商动作',items:['联系品牌拓展负责人并获取品牌资料','补充成熟门店经营数据','匹配铺位并完成工程踏勘','提交招商审批']}],source:'楼内业态与销售来自飞书多维表格只读同步；候选位置由高德地图提供；经营与租赁参数尚未提供。'};
      return <>{header(<><>{reportButton(poiPdfReport)}</><button className="btn" onClick={()=>setDrawer('history')}><History size={16}/>分析历史</button></>)}
      <div className="analysis-grid"><div className="grid"><section className="panel"><div className="panel-head"><div><h2>选择分析对象</h2><p className="page-subtitle">显示候选库中的全部商户</p></div><Link href="/shortlist" className="panel-note">管理候选库</Link></div>
        <label className="field" style={{marginTop:0}}><span className="field-label">搜索候选商户</span><span className="input-icon"><Search size={16}/><input className="form-control" value={analysisSearch} onChange={e=>setAnalysisSearch(e.target.value)} placeholder="输入商户名称"/></span></label>
        <div className="chips">{availableCandidates.map(key=><button key={key} className="chip" onClick={()=>selectCandidate(key)}>{candidates[key].name}</button>)}{availablePoiCandidates.map(item=><button key={item.poiId} className={`chip ${item.poiId===analysisPoiId?'active':''}`} onClick={()=>selectPoiCandidate(item.poiId)}>{item.merchant}</button>)}{!availableCandidates.length&&!availablePoiCandidates.length&&<span className="panel-note">候选库中没有匹配商户</span>}</div>
        <div className="form-row"><label className="field"><span className="field-label">业态大类</span><input className="form-control" value={selectedPoi.group||'待确认'} readOnly/></label><label className="field"><span className="field-label">细分业态</span><input className="form-control" value={selectedPoi.subtype||'待确认'} readOnly/></label><label className="field"><span className="field-label">高德评分</span><input className="form-control" value={selectedPoi.rating||'暂无'} readOnly/></label><label className="field"><span className="field-label">距写字楼</span><input className="form-control" value={formatDistance(selectedPoi.distance)} readOnly/></label></div>
        <div className="button-row"><Link className="btn" href="/shortlist"><Plus size={16}/>编辑候选资料</Link><Link className="icon-btn" href="/shortlist" aria-label="管理候选商户库" title="管理候选商户库"><BookmarkCheck size={16}/></Link></div></section>
        <section className="panel"><div className="panel-head"><h2>楼内业态基准</h2><span className="panel-note">{benchmarkStatus}</span></div>{feishuDataState==='live'?<div className="grid two"><Metric label="在营商户" value={`${poiBenchmark.totalCount} 家`} note={`${selectedPoi.group||'当前'}大类 ${poiBenchmark.categoryCount} 家`}/><Metric label={selectedPoi.subtype||'同细分业态'} value={`${poiBenchmark.subtypeCount} 家`} note={poiBenchmark.supply}/><Metric label="同业销售中位数" value={poiBenchmark.medianSales==null?'待补充':`${money(poiBenchmark.medianSales)} 万`} note={dataPeriod}/><Metric label="同业平均坪效" value={poiBenchmark.averageEfficiency==null?'待补充':`${money(poiBenchmark.averageEfficiency)} 元/㎡`} note={`${poiBenchmark.efficiencyCount} 家可计算`}/></div>:<div className={`integration-notice ${feishuDataState==='error'?'warn':''}`}><strong>{benchmarkStatus}</strong><span>{feishuDataError||'楼内真实基准加载完成后自动进入报告。'}</span></div>}</section></div>
        <section className="panel"><div className="result-head"><div><h2>{selectedPoi.merchant} · 招商初审结论</h2><div className="badge-row"><span className="badge blue">高德真实商户</span><span className="badge warn">暂缓完整决策</span></div><p className="summary">位置与业态信息已具备，可进入品牌接洽；因缺少租金、营收、成本、面积和工程条件，当前不能判断盈利能力，也不生成虚假的综合分数。</p></div><span className="panel-note">{selectedPoi.address}</span></div>
          <div className="section"><div className="decision-grid"><div className="decision"><h3>初步机会</h3><p>{feishuDataState!=='live'?'楼内真实业态基准加载完成后判断补位价值。':poiBenchmark.supply==='业态空缺'||poiBenchmark.supply==='供给偏少'?`楼内${selectedPoi.subtype||selectedPoi.group}为${poiBenchmark.supply}，具备补位价值。`:`楼内已有 ${poiBenchmark.subtypeCount} 家${selectedPoi.subtype||selectedPoi.group}，需要证明差异化。`} 候选门店距写字楼 {formatDistance(selectedPoi.distance)}。</p></div><div className="decision risk"><h3>决策缺口</h3><p>尚不能计算月销售、租售比、盈亏平衡、回收期和对楼内同业的分流。</p></div></div></div>
          <div className="integration-notice"><strong>完整分析触发条件</strong><span>补齐品牌经营样本、所需面积、报价租金、毛利和固定成本后，系统才会生成财务结论。</span></div></section></div>
      <section className="panel report-section" style={{marginTop:16}}><div className="panel-head"><div><h2>招商决策报告</h2><p className="page-subtitle">真实数据不足项全部保留为“待补充”</p></div><span className="badge warn">资料准备中</span></div>
        <div className="grid four"><Metric label="预计月销售" value="待补充" note="需品牌门店样本" warn/><Metric label="建议租金" value="待补充" note="需铺位与报价" warn/><Metric label="盈亏平衡" value="待补充" note="需毛利与成本" warn/><Metric label="预计分流" value="待补充" note="需同业销售基准" warn/></div>
        <div className="report-grid section"><div className="report-block"><h3>写字楼适配</h3><p>优先核验其工作日客流、午间或晚间高峰经营能力，以及是否依赖购物中心周末自然客流。</p></div><div className="report-block"><h3>竞争与分流</h3><p>高德已确认候选门店位置；周边同类数量需在商户搜索页按 2、5、10 公里半径复核，楼内同业分流待经营资料齐备后测算。</p></div><div className="report-block risk"><h3>风险预警</h3><p>在缺少财务与工程资料的情况下签署租赁条件，可能高估品牌承租能力和楼宇补位价值。</p></div><div className="report-block"><h3>审批前置条件</h3><p>品牌联系人、面积需求、租金承受、成熟门店月销售、毛利、固定成本、给排水及消防要求。</p></div></div>
        <div className="section"><div className="section-title"><h3>下一步招商动作</h3><span className="panel-note">负责人：{selectedPoi.owner}</span></div><div className="table-wrap"><table className="action-table"><thead><tr><th>顺序</th><th>动作</th><th>交付结果</th><th>截止时间</th></tr></thead><tbody><tr><td>1</td><td>联系品牌拓展负责人</td><td>品牌资料及开店条件</td><td>3 个工作日内</td></tr><tr><td>2</td><td>补充成熟门店经营数据</td><td>可验证的营收与成本口径</td><td>资料接收后 2 日</td></tr><tr><td>3</td><td>匹配铺位并踏勘</td><td>面积、工程和租金方案</td><td>经营初审通过后</td></tr><tr><td>4</td><td>提交招商审批</td><td>结论、风险和谈判底线</td><td>完整测算后 1 日</td></tr></tbody></table></div></div>
        <div className="report-source"><strong>数据来源</strong><span>楼内业态与销售：飞书多维表格（只读）；候选位置：高德地图；经营与租赁参数：尚未提供。系统不会修改飞书字段。</span></div></section></>;
    }
    const candidatePdfReport={fileName:`${p.name}-招商分析报告`,title:`${p.name} · 完整招商决策报告`,verdict:p.verdict,score:p.score,confidence:bc.confidence,summary:p.summary,facts:[['业态',`${p.group} · ${p.subtype}`],['基准月销售',`${money(bc.revenue.base)} 万元`],['建议租金区间',bc.rentBand],['盈亏平衡营收',`${bc.breakeven} 万元/月`],['预计分流',`约 ${bc.cannibalization}%`],['楼内供给',`${benchmark.subtypeCount} 家${p.subtype} · ${benchmark.supply}`]],sections:[{title:'财务三情景',items:scenarioRows.map(row=>{const assessment=assessRentSales(p.group,row.rentSales);return `${row.label}：月销售 ${money(row.revenue)} 万，经营利润 ${money(row.profit)} 万，租售比 ${row.rentSales.toFixed(1)}%，回收期 ${row.payback} 个月，${assessment.level}`})},{title:'楼内供需与写字楼适配',items:[feishuDataState==='live'?`楼内在营 ${benchmark.totalCount} 家，其中${p.group} ${benchmark.categoryCount} 家、${p.subtype} ${benchmark.subtypeCount} 家，判断为${benchmark.supply}`:'飞书真实数据正在加载，暂不引用模拟商户数量',`适配度 ${profile.officeFit}；主要消费时段 ${profile.period}；自然客流依赖 ${profile.trafficDependency}`,`工程条件：${profile.engineering}`]},{title:'竞争、风险与招商条件',items:[`竞争与分流：模型预计楼内同业分流约 ${bc.cannibalization}%`,p.riskText,...profile.conditions]},{title:'审批行动',items:['核验品牌经营数据与开店模型','目标铺位工程踏勘','租金及保护条款谈判','提交招商审批']}],source:`楼内商户、面积和销售来自飞书多维表格只读同步（${dataPeriod}）；候选财务参数为招商测算样本，必须经品牌尽调确认；周边竞争需由高德实时搜索复核。`};
    return <>{header(<><>{reportButton(candidatePdfReport)}</><button className="btn" onClick={()=>setDrawer('history')}><History size={16}/>分析历史</button></>)}
      <div className="analysis-grid"><div className="grid"><section className="panel"><div className="panel-head"><div><h2>选择分析对象</h2><p className="page-subtitle">仅显示已加入候选商户库的品牌</p></div><Link href="/shortlist" className="panel-note">管理候选库</Link></div>
        <label className="field" style={{marginTop:0}}><span className="field-label">搜索候选品牌</span><span className="input-icon"><Search size={16}/><input className="form-control" value={analysisSearch} onChange={e=>setAnalysisSearch(e.target.value)} placeholder="输入品牌名称"/></span></label>
        <div className="chips">{availableCandidates.map(key=><button key={key} className={`chip ${key===candidateKey&&!analysisPoiId?'active':''}`} onClick={()=>selectCandidate(key)}>{candidates[key].name}</button>)}{availablePoiCandidates.map(item=><button key={item.poiId} className="chip" onClick={()=>selectPoiCandidate(item.poiId)}>{item.merchant}</button>)}{!availableCandidates.length&&!availablePoiCandidates.length&&<span className="panel-note">候选库中没有匹配商户</span>}</div>
        <div className="discovery-link"><span>还没有确定品牌？</span><Link href="/compare"><Search size={14}/>搜索周边商户</Link></div>
        <div className="form-row"><label className="field"><span className="field-label">业态大类</span><input className="form-control" value={p.group} readOnly/></label><label className="field"><span className="field-label">细分业态</span><input className="form-control" value={p.subtype} readOnly/></label><label className="field"><span className="field-label">客单价</span><input className="form-control" value={p.price} readOnly/></label><label className="field"><span className="field-label">所需面积</span><input className="form-control" value={p.area} readOnly/></label></div>
        <div className="button-row"><button className="btn primary" onClick={()=>notify(`${p.name} 的招商分析已更新`)}><Sparkles size={16}/>生成招商分析</button><Link className="icon-btn" href="/shortlist" aria-label="管理候选商户库" title="管理候选商户库"><BookmarkCheck size={16}/></Link></div></section>
        <section className="panel"><div className="panel-head"><h2>楼内业态基准</h2><span className="panel-note">{benchmarkStatus}</span></div>{feishuDataState==='live'?<div className="grid two"><Metric label="在营商户" value={`${benchmark.totalCount} 家`} note={`${p.group} ${benchmark.categoryCount} 家`}/><Metric label={p.subtype} value={`${benchmark.subtypeCount} 家`} note={benchmark.supply}/><Metric label="同业销售中位数" value={benchmark.medianSales==null?'待补充':`${money(benchmark.medianSales)} 万`} note={dataPeriod}/><Metric label="同业平均坪效" value={benchmark.averageEfficiency==null?'待补充':`${money(benchmark.averageEfficiency)} 元/㎡`} note={`${benchmark.efficiencyCount} 家可计算`}/></div>:<div className={`integration-notice ${feishuDataState==='error'?'warn':''}`}><strong>{benchmarkStatus}</strong><span>{feishuDataError||'加载完成后自动形成真实楼内基准。'}</span></div>}</section></div>
        <section className="panel"><div className="result-head"><div className="score-wrap"><div className="score-ring" style={{'--score':p.score}}><span>{p.score}</span></div><div><h2>{p.name} · 招商建议</h2><div className="badge-row"><span className="badge"><CircleCheck size={14}/>{p.verdict}</span><span className="badge warn">{p.risk}</span><span className="badge blue">可信度 {bc.confidence}%</span></div><p className="summary">{p.summary}</p></div></div><span className="panel-note">得分区间 {bc.range}</span></div>
          <div className="section"><div className="section-title"><h3>适配度构成</h3><span className="panel-note">总分 {p.score}</span></div><div className="bars">{p.bars.map(([label,value,warn])=><div className={`bar-row ${warn?'warn':''}`} key={label}><span>{label}</span><div className="track"><div className="fill" style={{'--value':value}}/></div><span className="bar-value">{value}</span></div>)}</div></div>
          <div className="section"><div className="decision-grid"><div className="decision"><h3>主要机会</h3><p>{p.opportunity}</p></div><div className="decision risk"><h3>主要风险</h3><p>{p.riskText}</p></div></div></div></section></div>
      <div className="grid two" style={{marginTop:16}}><section className="panel"><div className="panel-head"><div><h2>招商财务测算（待品牌核验）</h2><p className="page-subtitle">测算样本 · 单位：万元/月</p></div><div className="scenario-switch">{[['low','保守'],['base','基准'],['high','乐观']].map(([key,label])=><button key={key} className={`chip ${scenario===key?'active':''}`} onClick={()=>setScenario(key)}>{label}</button>)}</div></div>
        <div className="grid four"><Metric label="预计营收" value={money(fm.revenue)} note={`区间 ${bc.revenue.low}–${bc.revenue.high}`}/><Metric label="租售比" value={`${fm.rentSales.toFixed(1)}%`} note={`${rentRisk.level} · ${p.group}关注线 ${threshold.watch}%`} warn={rentRisk.level!=='可接受'}/><Metric label="经营利润" value={money(fm.profit)} note={`毛利率 ${bc.grossMargin}%`} warn={fm.profit<0}/><Metric label="回收期" value={`${fm.payback} 月`} note={`装修投入 ${bc.capex} 万`}/></div>
        <div className="section"><table><tbody><tr><td>盈亏平衡营收</td><td className="num">{bc.breakeven} 万/月</td></tr><tr><td>建议租金区间</td><td className="num">{bc.rentBand}</td></tr></tbody></table></div></section>
        <section className="panel"><div className="panel-head"><h2>可信度与铺位建议</h2><span className="panel-note">参数待品牌核验</span></div><Confidence label="模型可信度" value={bc.confidence}/><Confidence label="数据完整度" value={bc.completeness} blue/><div className="section"><div className="section-title"><h3>推荐铺位</h3><Link href="/units" className="panel-note">查看全部</Link></div><div className="signal-list">{top.map(unit=><div className="signal-row" key={unit.code}><span><b className="unit-code">{unit.code}</b> · {unit.floor} · {unit.area}㎡</span><span>{unit.rent} 万/月</span><strong>{unit.fit[candidateKey]}分</strong></div>)}</div></div><div className="section"><div className="decision-grid"><div className="decision risk"><h3>预计分流</h3><p>测算样本约 {bc.cannibalization}%，需用楼内同业真实销售复核。</p></div><div className="decision"><h3>周边竞争</h3><p>同类门店样本 {bc.nearby} 家，需用高德实时半径搜索复核。</p></div></div></div></section></div>
      <section className="panel report-section" style={{marginTop:16}}><div className="panel-head"><div><h2>{p.name} · 完整招商决策报告</h2><p className="page-subtitle">从“是否能招”到谈判与审批的统一结论</p></div><div className="badge-row"><span className="badge"><CircleCheck size={14}/>{p.verdict}</span><span className="badge blue">综合得分 {p.score}</span><span className="badge blue">可信度 {bc.confidence}%</span></div></div>
        <div className="decision-banner"><div><span className="metric-label">最终建议</span><strong>{p.verdict}</strong><p>{p.summary}</p></div><div className="decision-banner-side"><span>数据完整度</span><b>{bc.completeness}%</b><small>{benchmarkStatus}</small></div></div>
        <div className="grid four section"><Metric label="基准月销售" value={`${money(bc.revenue.base)} 万`} note={`保守 ${bc.revenue.low} · 乐观 ${bc.revenue.high}`}/><Metric label="建议租金" value={bc.rentBand} note={`${p.group}租售比关注线 ${threshold.watch}%`}/><Metric label="盈亏平衡" value={`${bc.breakeven} 万`} note="达到后覆盖经营成本"/><Metric label="预计分流" value={`约 ${bc.cannibalization}%`} note="待楼内真实同业数据复核" warn={bc.cannibalization>=15}/></div>
        <div className="section"><div className="section-title"><h3>财务三情景</h3><span className="panel-note">测算参数待品牌尽调确认</span></div><div className="table-wrap"><table className="scenario-table"><thead><tr><th>情景</th><th className="num">月销售</th><th className="num">经营利润</th><th className="num">租售比</th><th className="num">回收期</th><th>判断</th></tr></thead><tbody>{scenarioRows.map(row=>{const assessment=assessRentSales(p.group,row.rentSales);return <tr key={row.key} className={scenario===row.key?'selected-row':''}><td><b>{row.label}</b></td><td className="num">{money(row.revenue)} 万</td><td className="num">{money(row.profit)} 万</td><td className="num">{row.rentSales.toFixed(1)}%</td><td className="num">{row.payback} 月</td><td><span className={`badge ${assessment.level==='可接受'?'':assessment.level==='需关注'?'warn':'warn'}`}>{assessment.level}</span></td></tr>})}</tbody></table></div></div>
        <div className="report-grid section"><div className="report-block"><h3>楼内业态供需</h3><p>{feishuDataState==='live'?`楼内在营 ${benchmark.totalCount} 家，其中${p.group} ${benchmark.categoryCount} 家、${p.subtype} ${benchmark.subtypeCount} 家，判断为“${benchmark.supply}”。${benchmark.medianSales==null?'同业销售样本不足。':`同业销售中位数为 ${money(benchmark.medianSales)} 万。`}`:'飞书真实数据正在加载，暂不引用模拟商户数量。'}</p></div><div className="report-block"><h3>写字楼适配</h3><p>适配度 {profile.officeFit}；主要消费时段为{profile.period}；自然客流依赖{profile.trafficDependency}。工程侧：{profile.engineering}。</p></div><div className="report-block"><h3>竞争与分流</h3><p>模型预计楼内同业分流约 {bc.cannibalization}%。招商前需在高德地图按目标半径复核周边同类门店，并用飞书同业销售验证分流承受度。</p></div><div className="report-block risk"><h3>风险预警</h3><p>{p.riskText} 当前{p.group}租售比关注线为 {threshold.watch}%、高风险线为 {threshold.high}%，本情景判断为“{rentRisk.level}”。</p></div></div>
        <div className="section"><div className="section-title"><h3>项目历史经营约束</h3><span className="panel-note">来自 2024—2025 经营分析报告</span></div><div className="history-signals"><div><strong>销售承压</strong><span>2024 全业态销售同比 -13%，餐饮 -14%，零售 -30%。</span></div><div><strong>恢复有限</strong><span>2025 一季度 -2%、二季度 -6%、三季度持平，改善主要由餐饮和单店拉动。</span></div><div><strong>招商原则</strong><span>高出租率不等于经营健康；优先引入适合写字楼工作日客流的品牌，不依赖纯购物中心模型。</span></div><div><strong>运营原则</strong><span>活动曝光不能代替销售结果，后续持续跟踪租售比、坪效、销售趋势、欠费和分流。</span></div></div></div>
        <div className="section"><div className="section-title"><h3>招商条件与行动清单</h3><span className="panel-note">负责人：{workflow.owner} · 阶段：{workflow.stage}</span></div><div className="condition-list">{profile.conditions.map(item=><div key={item}><CircleCheck size={15}/><span>{item}</span></div>)}</div><div className="table-wrap" style={{marginTop:12}}><table className="action-table"><thead><tr><th>顺序</th><th>动作</th><th>负责人</th><th>截止时间</th><th>审批结果</th></tr></thead><tbody><tr><td>1</td><td>核验品牌经营数据与开店模型</td><td>{workflow.owner}</td><td>3 个工作日内</td><td>确认真实测算参数</td></tr><tr><td>2</td><td>目标铺位工程踏勘</td><td>工程负责人</td><td>数据核验后 2 日</td><td>确认可实施与改造成本</td></tr><tr><td>3</td><td>租金及保护条款谈判</td><td>{workflow.owner}</td><td>踏勘通过后 5 日</td><td>不突破租售比关注线</td></tr><tr><td>4</td><td>提交招商审批</td><td>招商负责人</td><td>谈判完成后 1 日</td><td>附财务、分流与风险结论</td></tr></tbody></table></div></div>
        <div className="report-source"><strong>数据来源与口径</strong><span>楼内商户、面积和销售来自飞书多维表格只读同步（{dataPeriod}）；候选财务参数为招商测算样本，必须经品牌尽调确认；周边竞争需由高德实时搜索复核。飞书字段不会被网站修改。</span></div></section></>;
  }

  const activeLocations=liveLocations;
  const searchResults=amapMode==='live'?liveLocations:[];
  const searchPageSize = 3;
  const searchPageCount = Math.max(1, Math.ceil(searchResults.length / searchPageSize));
  const visibleSearchResults = searchResults.slice((searchPage - 1) * searchPageSize, searchPage * searchPageSize);
  const farthestResultDistance=searchResults.reduce((maximum,item)=>Math.max(maximum,item.distance),0);
  const selectedLocations=selected.map(id=>activeLocations.find(item=>item.id===id)).filter(Boolean);
  const toggleLocation=id=>setSelected(current=>current.includes(id)?current.filter(item=>item!==id):current.length>=3?(notify('最多选择 3 家候选门店'),current):[...current,id]);

  useEffect(()=>{
    setSearchPage(1);
    setPageInput('1');
  },[compareSearch,compareGroup,compareSubtype,compareRadius,amapMode]);

  useEffect(()=>{
    if(searchPage > searchPageCount) setSearchPage(searchPageCount);
    setPageInput(String(Math.min(searchPage,searchPageCount)));
  },[searchPage,searchPageCount]);

  const jumpToSearchPage = () => {
    const requested = Number.parseInt(pageInput, 10);
    const target = Number.isFinite(requested) ? Math.min(searchPageCount, Math.max(1, requested)) : 1;
    setSearchPage(target);
    setPageInput(String(target));
    setPageJumpEditing(false);
  };

  const cancelPageJump = () => {
    setPageInput(String(searchPage));
    setPageJumpEditing(false);
  };

  function ComparePage(){
    const liveMap=amapMode==='live'&&amapCenter;
    return <>{header(<span className={`badge ${liveMap?'':'blue'}`}>{liveMap?'高德实时数据':amapMode==='connecting'?'高德连接中':'高德暂不可用'}</span>)}
      <div className="merchant-locator"><section className="panel"><div className="panel-head"><div><h2>搜索周边商户</h2><p className="page-subtitle">可收藏品牌，也可选择门店直接比较</p></div><span className="panel-note">最多对比 3 家</span></div>
        <label className="field" style={{marginTop:0}}><span className="field-label">关键词</span><span className="input-icon"><Search size={16}/><input id="compare-search" className="form-control" value={compareSearch} onChange={e=>setCompareSearch(e.target.value)} placeholder="例如：M Stand、金融中心店"/></span></label>
        <div className="form-row three-fields"><label className="field"><span className="field-label">业态大类</span><select className="form-select" value={compareGroup} onChange={e=>{setCompareGroup(e.target.value);setCompareSubtype('全部');}}>{CATEGORY_GROUPS.map(v=><option key={v}>{v}</option>)}</select></label><label className="field"><span className="field-label">细分业态</span><select className="form-select" value={compareSubtype} onChange={e=>setCompareSubtype(e.target.value)}>{SUBTYPES_BY_GROUP[compareGroup].map(v=><option key={v}>{v}</option>)}</select></label><label className="field"><span className="field-label">搜索半径</span><select className="form-select" value={compareRadius} onChange={e=>setCompareRadius(Number(e.target.value))}><option value="500">500 米</option><option value="1000">1 公里</option><option value="2000">2 公里</option><option value="5000">5 公里</option><option value="10000">10 公里</option></select></label></div>
        {amapError&&<div className="integration-notice"><strong>高德连接提示</strong><span>{amapError}，请稍后重试。</span></div>}
        <div className="section"><div className="section-title"><h3>搜索结果</h3><span className="panel-note">{amapMode==='connecting'||amapSearching?'搜索中…':`${searchResults.length} 家门店${excludedTenantCount?` · 已排除楼内 ${excludedTenantCount} 家`:''}${farthestResultDistance?` · 最远 ${formatDistance(farthestResultDistance)}`:''}`}</span></div><div className="search-result-list">{searchResults.length?visibleSearchResults.map(item=><div className="search-result" key={item.id}><div><h3>{item.merchant}{item.branch&&` · ${item.branch}`}</h3><p>{item.address}</p><div className="search-meta"><span>{item.group} · {item.subtype}</span><span>{formatDistance(item.distance)}</span><span>评分 {item.rating}</span><span>{item.sales}</span></div></div><div className="search-result-actions"><button className={`btn ${selected.includes(item.id)?'danger':''}`} onClick={()=>toggleLocation(item.id)}>{selected.includes(item.id)?'移出对比':'加入对比'}</button><button className={`btn ${isLocationSaved(item)?'saved':''}`} onClick={()=>saveLocationCandidate(item)} disabled={isLocationSaved(item)}>{isLocationSaved(item)?<CircleCheck size={15}/>:<BookmarkPlus size={15}/>} {isLocationSaved(item)?'已在候选库':'加入候选'}</button></div></div>):<div className="empty">{amapMode==='connecting'||amapSearching?'正在加载融科资讯中心周边真实商户':amapError?'真实商户数据暂时无法加载':'当前条件下没有匹配门店'}</div>}</div>{searchResults.length>searchPageSize&&<div className="pagination" aria-label="搜索结果分页"><button className="btn" onClick={()=>setSearchPage(page=>Math.max(1,page-1))} disabled={searchPage===1}>上一页</button><span className="pagination-status">第 {pageJumpEditing?<input aria-label="跳转页码" className="pagination-page-input" type="number" min="1" max={searchPageCount} value={pageInput} autoFocus onChange={event=>setPageInput(event.target.value)} onKeyDown={event=>{if(event.key==='Enter') jumpToSearchPage();if(event.key==='Escape') cancelPageJump();}} onBlur={cancelPageJump}/>:<button type="button" className="pagination-page-trigger" aria-label={`当前页第 ${searchPage} 页，点击输入页码`} onClick={()=>{setPageInput(String(searchPage));setPageJumpEditing(true);}}>{searchPage}</button>} / {searchPageCount} 页 · 每页 3 家</span><button className="btn" onClick={()=>setSearchPage(page=>Math.min(searchPageCount,page+1))} disabled={searchPage===searchPageCount}>下一页</button></div>}</div></section>
        <section className="panel"><div className="panel-head"><div><h2>融科资讯中心周边位置</h2><p className="page-subtitle">{liveMap?'高德地图实时 POI':amapMode==='connecting'?'正在连接高德地图':'高德地图暂不可用'}</p></div><span className="panel-note">半径 {compareRadius>=1000?`${compareRadius/1000}km`:`${compareRadius}m`}</span></div>{liveMap?<AmapMap center={amapCenter} pois={liveLocations} selectedIds={selected} radius={compareRadius} onToggle={toggleLocation} onError={setAmapError}/>:<div className="empty map-loading"><MapPinned size={28}/><p>{amapMode==='connecting'?'正在加载真实地图与周边商户':'暂时无法加载高德地图，请稍后重试'}</p></div>}
        <div className="section"><div className="section-title"><h3>已选门店</h3><span className="panel-note">{selected.length}/3</span></div><div className="selected-strip">{selectedLocations.map(item=><span className="selected-item" key={item.id}>{item.merchant} · {item.branch}<button className="icon-btn" style={{width:24,minHeight:24}} onClick={()=>toggleLocation(item.id)} aria-label={`移出${item.merchant}`}><X size={13}/></button></span>)}</div></div></section></div>
      <section className="panel" style={{marginTop:16}}><div className="panel-head"><h2>已选门店横向比较</h2><span className="panel-note">高德位置数据 + 招商参数</span></div><div className="table-wrap"><table style={{minWidth:1080}}><thead><tr><th>候选门店</th><th>位置</th><th className="num">距离</th><th className="num">得分</th><th className="num">可信度</th><th className="num">预计营收</th><th className="num">租售比</th><th>推荐铺位</th><th>操作</th></tr></thead><tbody>{selectedLocations.map(item=>{const p=item.key?candidates[item.key]:null,bc=item.key?businessCases[item.key]:null,unit=item.key?bestUnits(item.key)[0]:null;return <tr key={item.id}><td><b>{item.merchant}</b><br/><span className="panel-note">{item.branch}</span></td><td>{item.address}</td><td className="num">{item.distance}m</td><td className="num">{p?.score??'待评估'}</td><td className="num">{bc?`${bc.confidence}%`:'—'}</td><td className="num">{bc?`${bc.revenue.base}万`:'—'}</td><td className="num">{bc?`${(bc.rent/bc.revenue.base*100).toFixed(1)}%`:'—'}</td><td>{unit?<><b className="unit-code">{unit.code}</b> · {unit.fit[item.key]}分</>:'补充经营参数后匹配'}</td><td>{p?<Link href="/analysis" className="btn" onClick={()=>selectCandidate(item.key)}>详细测算</Link>:<button className="btn" onClick={()=>saveLocationCandidate(item)}>{isLocationSaved(item)?'已加入候选':'加入候选'}</button>}</td></tr>})}</tbody></table></div></section></>;
  }

  function ShortlistPage(){
    const shortlistItems=savedCandidateKeys.filter(key=>candidates[key].name.toLowerCase().includes(shortlistSearch.trim().toLowerCase()));
    const poiShortlistItems=savedPoiCandidates.filter(item=>`${item.merchant}${item.address}`.toLowerCase().includes(shortlistSearch.trim().toLowerCase()));
    const highPriority=savedCandidateKeys.filter(key=>candidates[key].score>=85).length;
    return <>{header(<Link href="/compare" className="btn primary"><Search size={16}/>搜索并添加商户</Link>)}
      <div className="grid three" style={{marginBottom:16}}><MetricCard label="候选品牌" value={`${savedCandidateKeys.length+savedPoiCandidates.length} 家`} note="由招商团队维护"/><MetricCard label="优先推进" value={`${highPriority} 家`} note="适配分不低于 85"/><MetricCard label="待补充资料" value={`${savedCandidateKeys.filter(key=>businessCases[key].completeness<80).length+savedPoiCandidates.length} 家`} note="需要继续尽调" warn/></div>
      <section className="panel"><div className="toolbar"><label className="field search"><span className="field-label">搜索候选品牌</span><span className="input-icon"><Search size={16}/><input className="form-control" value={shortlistSearch} onChange={e=>setShortlistSearch(e.target.value)} placeholder="品牌名称"/></span></label></div>
        <div className="table-wrap"><table style={{minWidth:1160}}><thead><tr><th>候选品牌</th><th>业态大类</th><th>细分业态</th><th>来源</th><th className="num">周边门店</th><th className="num">适配分</th><th>招商阶段</th><th>负责人</th><th>下一步</th><th>操作</th></tr></thead><tbody>{shortlistItems.map(key=>{const item=candidates[key],workflow=candidateWorkflow[key],branchCount=locations.filter(location=>location.key===key).length;return <tr key={key}><td><b>{item.name}</b><br/><span className="panel-note">{item.category}</span></td><td><span className={`category-swatch ${groupClass(item.group)}`}/>{item.group}</td><td>{item.subtype}</td><td>{workflow.source}</td><td className="num">{branchCount} 家</td><td className="num"><b className="unit-code">{item.score}</b></td><td><span className={`badge ${workflow.stage==='商务谈判'?'warn':workflow.stage==='初步筛选'?'blue':''}`}>{workflow.stage}</span></td><td>{workflow.owner}</td><td>{workflow.next}</td><td><div className="table-actions"><Link href="/analysis" className="btn" onClick={()=>selectCandidate(key)}><Sparkles size={15}/>分析</Link><button className="btn" onClick={()=>openSupplementDialog({type:'candidate',key,name:item.name})}><Plus size={15}/>补资料</button><button className="icon-btn danger" onClick={()=>removeCandidate(key)} aria-label={`移出${item.name}`} title="移出候选库"><X size={15}/></button></div></td></tr>})}{poiShortlistItems.map(item=><tr key={item.poiId}><td><b>{item.merchant}</b><br/><span className="panel-note">{item.address}</span></td><td><span className={`category-swatch ${groupClass(item.group)}`}/>{item.group}</td><td>{item.subtype||item.group}</td><td>高德地图</td><td className="num">1 家</td><td className="num"><span className="panel-note">待评估</span></td><td><span className="badge blue">待补充资料</span></td><td>{item.owner}</td><td>{item.next}</td><td><div className="table-actions"><Link href="/analysis" className="btn" onClick={()=>selectPoiCandidate(item.poiId)}><Sparkles size={15}/>分析</Link><button className="btn" onClick={()=>openSupplementDialog({type:'poi',poiId:item.poiId,name:item.merchant})}><Plus size={15}/>补资料</button><button className="icon-btn danger" onClick={()=>removePoiCandidate(item.poiId)} aria-label={`移出${item.merchant}`} title="移出候选库"><X size={15}/></button></div></td></tr>)}</tbody></table></div>
        {!shortlistItems.length&&!poiShortlistItems.length&&<div className="empty"><BookmarkPlus size={28}/><p>候选库中没有匹配品牌</p><Link href="/compare" className="btn" style={{marginTop:12}}>搜索周边商户</Link></div>}
      </section></>;
  }

  const filteredMerchants=displayMerchants.filter(item=>(merchantGroup==='全部'||item.group===merchantGroup)&&(merchantSubtype==='全部'||item.subtype===merchantSubtype)&&(!merchantSearch||`${item.name}${item.group}${item.subtype}`.toLowerCase().includes(merchantSearch.toLowerCase())));
  function MerchantsPage(){const totalMerchants=displayMerchants.length;return <>{header(<button className="btn" onClick={()=>notify('商户数据已导出')} disabled={feishuDataState!=='live'}><Download size={16}/>导出 CSV</button>)}<div className="grid four" style={{marginBottom:16}}>{CATEGORY_GROUPS.slice(1).map(label=>{const count=displayMerchants.filter(item=>item.group===label).length;return <MetricCard key={label} label={label} value={feishuDataState==='live'?`${count} 家`:'—'} note={feishuDataState==='live'?`占比 ${totalMerchants?Math.round(count/totalMerchants*100):0}%`:'等待飞书数据'}/>})}</div><section className="panel"><div className="toolbar"><label className="field search"><span className="field-label">搜索商户</span><span className="input-icon"><Search size={16}/><input className="form-control" value={merchantSearch} onChange={e=>setMerchantSearch(e.target.value)} placeholder="名称、大类或细分业态" disabled={feishuDataState!=='live'}/></span></label><label className="field"><span className="field-label">年份</span><select className="form-select" value={merchantYear} onChange={e=>setMerchantYear(e.target.value)}><option value="2025">2025年</option><option value="2026">2026年</option></select></label><label className="field"><span className="field-label">月份</span><select className="form-select" value={merchantMonth} onChange={e=>setMerchantMonth(e.target.value)}><option value="all">全年累计</option>{Array.from({length:12},(_,index)=><option key={index+1} value={String(index+1)}>{index+1}月</option>)}</select></label></div>{feishuDataState==='loading'&&<div className="integration-notice" style={{marginBottom:16}}><strong>正在读取飞书数据</strong><span>{merchantYear}年商户记录加载中，请稍候。</span></div>}{feishuDataState==='error'&&<div className="integration-notice warn" style={{marginBottom:16}}><strong>飞书数据暂时无法显示</strong><span>{feishuDataError||'请稍后重试。'}</span></div>}<div className="table-wrap"><table style={{minWidth:760}}><thead><tr><th>商户</th><th>大类</th><th>细分业态</th><th>楼层</th><th className="num">面积</th><th className="num">{merchantMonth==='all'?`${merchantYear}年累计销售`:`${merchantMonth}月销售`}</th><th>状态</th></tr></thead><tbody>{filteredMerchants.map(item=><tr key={item.id}><td>{item.name}</td><td><span className={`category-swatch ${groupClass(item.group)}`}/>{item.group}</td><td>{item.subtype}</td><td>{item.floor||'未提供'}</td><td className="num">{item.area==null?'未提供':`${money(item.area)}㎡`}</td><td className="num">{item.revenue==null?'未提供':`${money(item.revenue)}万`}</td><td><span className="badge">{item.status||'在营'}</span></td></tr>)}{!filteredMerchants.length&&<tr><td colSpan="7" className="panel-note" style={{textAlign:'center',padding:'24px 16px'}}>{feishuDataState==='loading'?'正在读取飞书数据...':feishuDataState==='error'?'当前没有可显示的飞书商户数据':'当前筛选条件下没有商户'}</td></tr>}</tbody></table></div><p className="panel-note" style={{marginTop:12}}>显示 {filteredMerchants.length}/{displayMerchants.length} 家商户 · {merchantYear}年{merchantMonth==='all'?'全年':`${merchantMonth}月`} · {feishuDataState==='loading'?'读取中':feishuDataState==='error'?'读取失败':'飞书只读'}</p></section></>}

  function UnitsPage(){const totalArea=units.reduce((s,u)=>s+u.area,0),totalRent=units.reduce((s,u)=>s+u.rent,0);return <>{header(<button className="btn" onClick={()=>notify('铺位表已导出')}><Download size={16}/>导出铺位表</button>)}<div className="grid four" style={{marginBottom:16}}><MetricCard label="可招商铺位" value="6 个" note="覆盖 B1–4F"/><MetricCard label="可招商面积" value={`${money(totalArea)}㎡`} note={`平均 ${Math.round(totalArea/6)}㎡`}/><MetricCard label="潜在月租" value={`${money(totalRent)}万`} note="满租情景"/><MetricCard label="60天内交付" value="3 个" note="需优先招商" warn/></div><section className="panel"><div className="panel-head"><h2>铺位条件与商户匹配</h2><span className="panel-note">工程条件已纳入适配分</span></div><div className="table-wrap"><table style={{minWidth:1030}}><thead><tr><th>铺位</th><th>楼层</th><th className="num">面积</th><th className="num">月租</th><th className="num">电量</th><th>给排水</th><th>排烟</th><th>燃气</th><th>营业时段</th><th>交付日</th><th>最佳候选</th></tr></thead><tbody>{units.map(unit=>{const [key,score]=Object.entries(unit.fit).sort((a,b)=>b[1]-a[1])[0];return <tr key={unit.code}><td><b className="unit-code">{unit.code}</b></td><td>{unit.floor}</td><td className="num">{unit.area}㎡</td><td className="num">{unit.rent}万</td><td className="num">{unit.power}kW</td><td>{unit.water}</td><td>{unit.exhaust}</td><td>{unit.gas}</td><td>{unit.hours}</td><td>{unit.delivery}</td><td>{candidates[key].name} · <b>{score}分</b></td></tr>})}</tbody></table></div></section></>}

  function AudiencePage(){return <>{header(<select className="form-select" style={{width:140}}><option>近30天</option><option>近90天</option><option>本年度</option></select>)}<div className="grid four" style={{marginBottom:16}}><MetricCard label="楼内员工" value="6,280" note="较上月 +3.2%"/><MetricCard label="白领客群占比" value="73%" note="核心招商客群"/><MetricCard label="平均年龄" value="31.6" note="25–35岁占58%"/><MetricCard label="月均商业消费" value="1,860元" note="较上月 +6.4%"/></div><div className="grid two"><section className="panel"><div className="panel-head"><h2>核心客群结构</h2><span className="panel-note">按消费人数</span></div>{[['企业白领',73],['访客与客户',14],['周边居民',8],['物业与服务',5]].map(([label,value])=><Confidence key={label} label={label} value={value}/>)}</section><section className="panel"><div className="panel-head"><h2>招商偏好信号</h2><span className="panel-note">需求与供给</span></div><div className="signal-list">{[['工作日午餐','94','需差异化'],['精品咖啡与下午茶','88','仍有空间'],['下班后运动','84','模式互补'],['生活便利零售','71','补充密度']].map(row=><div className="signal-row" key={row[0]}><span>{row[0]}</span><span>指数 {row[1]}</span><strong>{row[2]}</strong></div>)}</div></section></div></>}

  function OperationsPage(){
    const periodLabel=merchantMonth==='all'?`${merchantYear}年全年累计`:`${merchantYear}年${merchantMonth}月`;
    const merchantsWithSales=displayMerchants.filter(item=>Number.isFinite(item.revenue));
    const totalSales=merchantsWithSales.reduce((sum,item)=>sum+item.revenue,0);
    const merchantsWithArea=merchantsWithSales.filter(item=>Number.isFinite(item.area)&&item.area>0);
    const totalArea=merchantsWithArea.reduce((sum,item)=>sum+item.area,0);
    const salesPerArea=totalArea?totalSales*10000/totalArea:null;
    const notLeased=displayMerchants.filter(item=>item.status==='未起租'||item.status==='未提供').length;
    const top=[...merchantsWithSales].sort((a,b)=>b.revenue-a.revenue).slice(0,8);
    return <>{header(<><div className="toolbar" style={{margin:0}}><label className="field"><span className="field-label">年份</span><select className="form-select" value={merchantYear} onChange={e=>setMerchantYear(e.target.value)}><option value="2025">2025年</option><option value="2026">2026年</option></select></label><label className="field"><span className="field-label">月份</span><select className="form-select" value={merchantMonth} onChange={e=>setMerchantMonth(e.target.value)}><option value="all">全年累计</option>{Array.from({length:12},(_,index)=><option key={index+1} value={String(index+1)}>{index+1}月</option>)}</select></label></div><button className="btn" onClick={()=>notify('经营月报已生成')}><FileDown size={16}/>生成月报</button></>)}<div className="grid four" style={{marginBottom:16}}><MetricCard label={merchantMonth==='all'?'商户累计销售':'商户总销售'} value={feishuDataState==='live'?`${money(totalSales)}万`:'未提供'} note={`${periodLabel} · 飞书只读`}/><MetricCard label="有销售记录商户" value={feishuDataState==='live'?`${merchantsWithSales.length} 家`:'未提供'} note={feishuDataState==='live'?`共 ${displayMerchants.length} 家商户`:'等待飞书数据'}/><MetricCard label="可计算坪效" value={salesPerArea==null?'未提供':`${money(salesPerArea)}元/㎡`} note={salesPerArea==null?'需同时具备销售与面积':'按当前筛选口径'}/><MetricCard label="未起租商户" value={feishuDataState==='live'?`${notLeased} 家`:'未提供'} note="按飞书租赁状态" warn={notLeased>0}/></div><section className="panel"><div className="panel-head"><h2>销售额前八商户</h2><span className="panel-note">{periodLabel} · 按销售额排序</span></div><div className="table-wrap"><table style={{minWidth:840}}><thead><tr><th>排名</th><th>商户</th><th>业态</th><th>楼层</th><th className="num">{merchantMonth==='all'?'累计销售':'销售额'}</th><th className="num">面积</th><th className="num">坪效</th><th>状态</th></tr></thead><tbody>{top.map((item,index)=>{const efficiency=Number.isFinite(item.area)&&item.area>0?item.revenue*10000/item.area:null;return <tr key={item.id}><td>{index+1}</td><td><b>{item.name}</b></td><td>{item.group} · {item.subtype}</td><td>{item.floor||'未提供'}</td><td className="num">{money(item.revenue)}万</td><td className="num">{item.area==null?'未提供':`${money(item.area)}㎡`}</td><td className="num">{efficiency==null?'未提供':`${money(efficiency)}元/㎡`}</td><td><span className="badge">{item.status||'未提供'}</span></td></tr>})}{!top.length&&<tr><td colSpan="8" className="panel-note" style={{textAlign:'center',padding:'24px 16px'}}>{feishuDataState==='loading'?'正在读取飞书数据...':'当前筛选口径下没有销售记录'}</td></tr>}</tbody></table></div><p className="panel-note" style={{marginTop:12}}>销售与面积均来自飞书只读数据；租金、租售比等未提供字段不会使用模拟值。</p></section></>}

  function DecisionsPage(){return <>{header(<button className="btn primary" onClick={()=>notify('新的决策事项已创建')}><Plus size={16}/>新建决策</button>)}<div className="pipeline" style={{marginBottom:16}}>{[['初步分析',3,'active'],['尽调与复核',2,'active'],['商务谈判',1,'warn'],['内部审批',1,''],['已签约',0,'']].map(([label,count,cls])=><div className={`pipeline-step ${cls}`} key={label}><span>{label}</span><strong>{count}</strong></div>)}</div><section className="panel"><div className="panel-head"><h2>在途决策事项</h2><span className="panel-note">按截止日期排序</span></div><div className="table-wrap"><table style={{minWidth:920}}><thead><tr><th>候选商户</th><th className="num">评分</th><th>阶段</th><th>负责人</th><th>目标铺位</th><th>下一步</th><th>截止日</th><th>状态</th><th>操作</th></tr></thead><tbody>{decisions.map((r,i)=><tr key={r[0]}><td><b>{r[0]}</b></td><td className="num">{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td><td><b className="unit-code">{r[4]}</b></td><td>{r[5]}</td><td>{r[6]}</td><td><span className={`badge ${r[7]==='待审批'?'blue':r[7]==='进行中'?'':'warn'}`}>{r[7]}</span></td><td><button className="btn" onClick={()=>notify(`${r[0]}的决策记录已打开`)}>更新</button></td></tr>)}</tbody></table></div></section></>}

  async function checkFeishuConnection(){
    if(!feishuStatus?.configured){
      notify('请先在 Vercel 配置飞书 App ID 和 App Secret');
      return;
    }
    setFeishuSyncing(true);
    setFeishuResult(null);
    try {
      const response=await fetch('/api/feishu',{method:'POST'});
      const data=await response.json();
      if(!response.ok||!data.ok) throw new Error(data.message||'飞书连接失败');
      setFeishuResult(data);
      notify(`连接成功，已读取 ${data.recordCount} 条记录`);
    } catch(error){
      setFeishuResult({ok:false,message:error.message});
      notify(error.message||'飞书连接失败');
    } finally {
      setFeishuSyncing(false);
    }
  }

  function ImportPage(){
    const configured=Boolean(feishuStatus?.configured);
    const statusText=feishuChecking?'检查中':configured?'已配置':'待配置';
    return <>{header(<span className={`badge ${configured?'':'blue'}`}>飞书只读接入</span>)}<div className="grid two"><section className="panel"><div className="panel-head"><div><h2>飞书多维表格</h2><p className="page-subtitle">网站只读取数据，不会新增、修改或删除飞书字段</p></div><span className={`badge ${configured?'':'warn'}`}>{statusText}</span></div><div className="signal-list feishu-config-list"><div className="signal-row"><span>数据表</span><span>按名称发现</span><strong>{feishuStatus?.tableName||'商业销售数据分析'}</strong></div><div className="signal-row"><span>App Token</span><span>服务端保存</span><strong>{feishuStatus?.appTokenConfigured?'已配置':'已预留'}</strong></div><div className="signal-row"><span>App ID</span><span>服务端保存</span><strong>{feishuStatus?.appIdConfigured?'已配置':'待配置'}</strong></div><div className="signal-row"><span>App Secret</span><span>服务端保存</span><strong>{feishuStatus?.appSecretConfigured?'已配置':'待配置'}</strong></div><div className="signal-row"><span>访问模式</span><span>Server API</span><strong>只读</strong></div></div>{!configured&&<div className="integration-notice"><strong>还差飞书应用凭证</strong><span>创建企业自建应用后，只需在 Vercel 环境变量中填写 App ID 和 App Secret。密钥不会显示在网页中。</span></div>}{feishuResult&&<div className={`integration-notice ${feishuResult.ok?'success':''}`}><strong>{feishuResult.ok?'连接成功':'连接失败'}</strong><span>{feishuResult.ok?`已识别“${feishuResult.tableName}”，读取 ${feishuResult.recordCount} 条记录。当前仅做连接校验，暂不覆盖网站数据。`:feishuResult.message}</span></div>}<div className="button-row"><button className="btn primary" disabled={!configured||feishuSyncing||feishuChecking} onClick={checkFeishuConnection}><Database size={16}/>{feishuSyncing?'正在读取':'检查飞书连接'}</button></div></section><section className="panel"><div className="panel-head"><h2>接入进度</h2><span className="badge blue">网站内部已预置</span></div><div className="signal-list"><div className="signal-row"><span>字段映射</span><span>原字段读取</span><strong>已完成</strong></div><div className="signal-row"><span>月份销售</span><span>1月-12月</span><strong>已完成</strong></div><div className="signal-row"><span>表格识别</span><span>按表名自动查找</span><strong>已完成</strong></div><div className="signal-row"><span>每日同步</span><span>定时任务</span><strong>待启用</strong></div><div className="signal-row"><span>数据落库</span><span>安全缓存</span><strong>待启用</strong></div><div className="signal-row"><span>登录保护</span><span>访问权限</span><strong>待启用</strong></div></div><div className="integration-notice"><strong>当前不会替换经营数据</strong><span>正式上线前还需完成登录保护、数据库缓存和每日自动同步。现在的连接检查不会把真实经营数据暴露到页面。</span></div></section></div></>}

  function ModelPage(){const labels={customer:'客群匹配',complement:'业态互补',spend:'消费能力',time:'消费时段',competition:'竞争强度',rent:'租金承受'},total=Object.values(weights).reduce((a,b)=>a+b,0);return <>{header(<><button className="btn" onClick={()=>setWeights({customer:26,complement:24,spend:16,time:12,competition:12,rent:10})}><RotateCcw size={16}/>恢复默认</button><button className="btn primary" disabled={total!==100} onClick={()=>notify('评分模型已保存')}><Save size={16}/>保存模型</button></>)}<div className="grid two"><section className="panel"><div className="panel-head"><div><h2>评分权重</h2><p className="page-subtitle">六项指标合计必须为100%</p></div><div><div className="model-total">{total}%</div><span className="panel-note">当前合计</span></div></div>{Object.entries(weights).map(([key,value])=><label className="weight-row" key={key}><span>{labels[key]}</span><input type="range" min="0" max="40" value={value} onChange={e=>setWeights({...weights,[key]:Number(e.target.value)})}/><span className="weight-value">{value}%</span></label>)}</section><section className="panel"><div className="panel-head"><h2>历史回测</h2><span className="badge blue">模拟样本</span></div><div className="grid three"><Metric label="样本数量" value="42" note="近24个月"/><Metric label="建议准确率" value="76%" note="较v1.2 +5pt"/><Metric label="平均误差" value="8.4分" note="目标低于7分"/></div><div className="section"><div className="decision risk"><h3>人工复核边界</h3><p>低样本业态、工程条件异常或租售比超过15%时必须进入人工审批。</p></div></div></section></div></>}

  const pages={analysis:<AnalysisPage/>,compare:<ComparePage/>,shortlist:<ShortlistPage/>,merchants:<MerchantsPage/>,units:<UnitsPage/>,audience:<AudiencePage/>,operations:<OperationsPage/>,decisions:<DecisionsPage/>,import:<ImportPage/>,model:<ModelPage/>};
  return <div className="app-shell"><aside className={`sidebar ${mobileOpen?'open':''}`}><Link className="brand" href="/analysis"><span className="brand-mark"><Building2 size={18}/></span><span>楼宇招商分析台</span></Link><nav className="nav" aria-label="主导航">{navGroups.map(group=><div key={group.label}><div className="nav-label">{group.label}</div>{group.items.map(([key,label,Icon])=><Link className={`nav-link ${page===key?'active':''}`} href={`/${key}`} key={key}><Icon size={17}/>{label}</Link>)}</div>)}</nav><div className="sidebar-foot">Next.js 决策平台 · {hasAmapConfig?'高德地图已接入':'高德地图预留'}</div></aside><div className={`mobile-overlay ${mobileOpen?'open':''}`} onClick={()=>setMobileOpen(false)}/><section className="workspace"><header className="topbar"><div className="topbar-left"><button className="icon-btn mobile-menu" onClick={()=>setMobileOpen(true)} aria-label="打开导航"><Menu size={18}/></button><span className="building">中关村融科资讯中心 · 招商部</span></div><div className="topbar-actions"><span className="badge blue hide-mobile">Next.js</span><button className="btn hide-mobile" onClick={()=>setDrawer('history')}><History size={16}/>分析历史</button><button className="icon-btn" onClick={()=>setDrawer('notifications')} aria-label="消息"><Bell size={17}/></button><button className="icon-btn" onClick={()=>setDrawer('account')} aria-label="账户"><UserRound size={17}/></button></div></header><main className="main">{pages[page]}</main></section>{supplementDialog}{drawer&&<Drawer type={drawer} onClose={()=>setDrawer(null)}/>} {toast&&<div className="toast" role="status">{toast}</div>}</div>;
}

function Metric({label,value,note,warn}){return <div><span className="metric-label">{label}</span><div className="metric-value">{value}</div>{note&&<div className={`metric-note ${warn?'warn':''}`}>{note}</div>}</div>}
function MetricCard({label,value,note,warn}){return <div className="metric-card"><Metric label={label} value={value} note={note} warn={warn}/></div>}
function Confidence({label,value,blue}){return <div className="confidence"><span>{label}</span><div className="track"><div className="fill" style={{'--value':value,background:blue?'var(--blue)':undefined}}/></div><strong>{value}%</strong></div>}
function Drawer({type,onClose}){const content=type==='notifications'?[['7月经营数据已完成校验','25家商户数据均已进入分析基准。'],['3个铺位即将到期','建议本周启动续租与替换品牌评估。']]:type==='account'?[['环球中心 · 招商部','角色：招商主管 · 当前为模拟数据环境']]:[['超级猩猩 · 88分','优先引入 · 今天10:32'],['M Stand咖啡 · 82分','建议引入 · 昨天16:18'],['和府捞面 · 74分','条件引入 · 8月9日14:05']];return <div className="drawer-backdrop" onClick={onClose}><section className="drawer" onClick={e=>e.stopPropagation()}><div className="drawer-head"><h2>{type==='notifications'?'消息':type==='account'?'账户':'分析历史'}</h2><button className="icon-btn" onClick={onClose} aria-label="关闭"><X size={17}/></button></div>{content.map(([title,desc])=><div className="history-item" key={title}><h3>{title}</h3><p>{desc}</p></div>)}</section></div>}
