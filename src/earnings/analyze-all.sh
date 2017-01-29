#!/bin/bash

symbols=( A AA AAL AAP AAPL AAXJ ABB ABBV ABC ABEV ABMD ABT ABX ACAD ACHC ACIA ACM ACN ACWI ACWX ADBE ADI ADM ADP ADS ADSK AEE AEM AEO AEP AER AES AET AFL AG AGCO AGN AGNC AGU AIG AIV AJG AKAM AKS ALB ALGN ALK ALL ALLE ALLY ALV ALXN AMAT AMBA AMD AME AMG AMGN AMH AMP AMSG AMT AMTD AMX AMZN AN ANET ANSS ANTM AON AOS APA APC APD APH AR ARCC ARE ARIA ARMK ARRS ASH ASML ATHN ATI ATVI ATW AU AUY AVB AVGO AVT AVY AWH AWK AXP AXTA AYI AZN AZO BA BABA BAC BAX BBBY BBD BBL BBRY BBT BBY BC BCR BDX BEAV BEN BERY BG BHI BHP BIDU BIG BIIB BK BKD BLK BLL BLUE BMRN BMY BNDX BP BPL BRCD BSX BUD BURL BWA BWLD BX BXP C CA CAA CAB CAG CAH CAKE CAR CASY CAT CAVM CB CBG CBI CBOE CBRL CBS CC CCE CCI CCK CCL CDE CE CELG CERN CF CFG CFR CHD CHK CHKP CHRW CHTR CI CIEN CINF CIT CL CLB CLF CLR CLX CMA CMC CMCSA CME CMG CMI CMS CNC CNI CNP CNQ CNX COF COG COH COL COMM CONE COO COP COST CP CPB CPE CPHD CPN CPT CRI CRM CRUS CS CSC CSCO CSX CTAS CTL CTRP CTSH CTXS CTY CUBE CVS CVX CX CXO CY D DAL DATA DB DD DDD DE DECK DEO DFS DG DGX DHI DHR DIS DISCA DISH DKS DLPH DLR DLTR DNKN DOV DOW DPS DPZ DRE DRI DTE DUK DVA DVN DXCM DY EA EAT EBAY ECA ECL ED EDU EFX EGN EIX EL ELLI EMN EMR ENB ENDP EOG EPD EQIX EQR EQT ES ESRX ESS ESV ETE ETFC ETN ETP ETR EVHC EW EXAS EXC EXEL EXP EXPD EXPE EXR F FANG FAST FB FBHS FCAU FCX FDC FDS FDX FE FEYE FFIV FHN FIS FISV FIT FITB FIVE FL FLEX FLO FLR FLS FLT FMC FNF FNV FOX FOXA FRC FRT FSLR FTI FTNT FTR FTV GD GE GG GGP GILD GIMO GIS GLW GM GME GNTX GOLD GOOG GOOGL GPC GPK GPN GPOR GPS GRMN GRUB GS GSK GT GWR GWW GXP HAIN HAL HAR HAS HBAN HBI HCA HCN HCP HD HDB HDS HES HFC HIG HII HIW HL HLF HLS HLT HOG HOLX HON HP HPE HPP HPQ HRB HRL HRS HSBC HSIC HST HSY HTZ HUM HUN HZNP IAG IBB IBM IBN ICE ICPT IDXX IFF ILMN IM INCY INFO INFY INGR INTC INTU IONS IP IPG IR IRM ISRG IT ITUB ITW IVZ JACK JAZZ JBHT JBL JBLU JCI JCP JD JEC JLL JNJ JNPR JPM JWN K KATE KBH KEY KGC KHC KIM KKR KLAC KMB KMI KMX KO KORS KR KRC KSS KSU LAMR LB LBRDK LBTYA LBTYK LDOS LEA LEN LGF LH LHO LII LKQ LLL LLTC LLY LM LMT LNC LNKD LOW LRCX LULU LUV LVLT LVS LYB M MA MAA MAC MAN MAR MAS MAT MBLY MCD MCHI MCHP MCK MCO MD MDLZ MDT MDVN MELI MET MFC MGA MGM MHK MIDD MIK MJN MKC MKTX MLM MMC MMM MMP MNK MNST MO MOH MON MOS MPC MPEL MPLX MRK MRO MRVL MS MSCC MSCI MSFT MSI MSM MT MTB MTD MTG MTN MU MUR MXIM MYL NAVI NBIX NBL NBR NCLH NDAQ NE NEE NEM NFLX NFX NGG NI NKE NLSN NLY NNN NOC NOK NOV NOW NRG NSC NTAP NTES NTRS NUAN NUE NVDA NVO NVR NVRO NVS NWL NXPI NXST NYCB O OAS OC OFC OHI OKE OLN OMC ON OPK ORCL ORLY OSK OXY OZRK P PAA PANW PAY PAYX PBCT PBF PBR PCAR PCG PCLN PCRX PDCE PDCO PE PEG PEP PF PFE PFG PG PGR PH PHG PHM PII PKG PLCE PLD PM PNC PNR PNRA PNW POST POT PPG PPL PRGO PRU PRXL PSA PSX PTC PTEN PVH PWR PX PXD PYPL Q QCOM QEP QLIK QQQ QRVO QVCA R RAD RAI RCL RDC RDN RE REG REGN RF RGA RGLD RH RHI RHT RICE RIG RIO RJF RL RLYP RMD ROK ROP ROST RRC RSG RSPP RTN RY S SABR SAFM SAP SAVE SBAC SBNY SBUX SCG SCHW SCTY SCZ SE SEE SFM SGEN SHO SHOP SHPG SHW SIG SINA SIRI SIVB SJM SLB SLCA SLG SLM SLW SM SNA SNI SNPS SNY SO SOXX SPB            SPG SPGI SPLK SPLS SPN SPR SQ SQQQ SRC SRCL SRE SRPT ST STI STLD STRZA STT STWD STX STZ SU SUM SWC SWFT SWK SWKS SWN SXL SYF SYK SYMC SYT SYY T TAP TCBI TD TDG TEL TER TEVA TEX TFX TGT THC THO TIF TJX TLT TMO TMUS TOL TOT TPX TQQQ TRGP TRIP TROW TRP TRV TS TSCO TSLA TSM TSN TSO TSRO TSS TTWO TV TVIX TWLO TWTR TWX TXN TXT TYL UA UAL UDR UHS UL ULTA ULTI UN UNH UNM UNP UPS URBN URI USB UTHR UTX V VAL VALE VAR VCIT VCSH VER VFC VIAB VIPS VLO VMC VMW VNO VNTV VOD VOYA VRSK VRSN VRTX VRX VTR VXUS VZ W WAB WAT WB WBA WCC WCG WCN WDAY WDC WEC WFC WFM WFT WHR WLK WLL WLTW WM WMB WMT WNR WOOF WPX WPZ WR WRK WSM WU WWAV WY WYN WYNN X XEC XEL XIV XL XLNX XOM XPO XRAY XRX XYL YELP YHOO YNDX YUM Z ZAYO ZBH ZION ZTS )

echo
echo "SYMBOL	MORNING AVG	DAY AVG		MORNING WIN %	DAY WIN %	RECENT GOOD?"
echo "======	===========	=======		=============	=========	============"

for symbol in ${symbols[*]}; do
    node analyze $symbol
    sleep 1
done

echo
