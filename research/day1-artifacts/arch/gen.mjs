const policy={version:1,classes:{S0:{web:"ONLY_ON_DEVICE",ios:"ON_DEVICE_SESSION",noModel:"DETERMINISTIC",cloud:false},S1:{web:"ONLY_ON_DEVICE",ios:"ON_DEVICE_SESSION",noModel:"TIER0",cloud:false},S2:{web:"PREFER_ON_DEVICE",ios:"HYBRID_MODEL",noModel:"CLOUD",cloud:true},S3:{web:"ONLY_IN_CLOUD",ios:"CLOUD",noModel:"CLOUD",cloud:true},S4:{web:"PREFER_ON_DEVICE",ios:"HYBRID_MODEL",noModel:"CLOUD",cloud:true}},jobs:{preScreen:"S1",vaultTextMatch:"S0",referee:"S0",fixPlan:"S0",explain:"S2",adversaryA:"S3",adversaryB:"S3"}};
const P=[
["kill_switch","false","BOOLEAN","true = block every cloud-capable AI call (S3; S2/S4 cloud side). Device and rules paths keep working; Judge Mode uses CACHED samples."],
["routing_policy",JSON.stringify(policy),"JSON","Routing by payload class. The client merges it with a hard floor: S0/S1 can never be loosened."],
["adversary_model","gemini-3.8-flash","STRING","Pass A/B/re-attack model. Exact id, never -latest."],
["adversary_thinking_level","MEDIUM","STRING","LOW|MEDIUM|HIGH. MINIMAL is a 400 on gemini-3.8-flash and gemini-4-*."],
["explain_cloud_model","gemini-3.5-flash-lite","STRING","Cloud side of S2 (explainer) and S4 (Judge Mode device jobs)."],
["explain_thinking_level","LOW","STRING","Flash-Lite accepts MINIMAL|LOW|MEDIUM|HIGH."],
["prompt_versions",JSON.stringify({advA:"advA.v1",advB:"advB.v1",nanoPre:"nanoPre.v1",nanoVaultText:"nanoVaultText.v1",nanoRef:"nanoRef.v1",nanoFix:"nanoFix.v1",explain:"explain.v1",fmPre:"fmPre.v1"}),"JSON","Full prompt ids. Selects among versions BUNDLED in the app; unknown ids fall back to the bundled v1. Prompt text never comes from Remote Config."],
["grounding_enabled","true","BOOLEAN","Run pass A (Search-grounded notes). false = pass B only."],
["data_tier","paid","STRING","paid|free. Drives the consent copy; free forces grounding off."],
["daily_adversary_cap","20","NUMBER","Attack runs (A+B pair = 1) per installation per LOCAL day, client-side. Keep project-wide grounded queries well below 1,500/day."],
["max_fix_rounds","3","NUMBER","Fix + re-attack rounds per photo."],
["bands_m",JSON.stringify({street:250,neighbourhood:1000,district:5000,city:30000,country:500000}),"JSON","Distance-band upper bounds in metres, strictly increasing. city/country are placeholders."],
["auto_mask_types",JSON.stringify(["name_text","mail_or_document","screen"]),"JSON","Nano pre-screen clue types masked in Standard mode when severity is high (faces, vault hits and regex hits are always masked). Subset of CLUE_TYPES."],
["strict_mode_default","false","BOOLEAN","Strict mode masks every flagged clue before the cloud sees anything."],
["fuzzy_threshold","0.8","NUMBER","Normalised Levenshtein similarity for text-to-vault matches (clamped 0.6-0.98)."],
["face_min_confidence","0.3","NUMBER","Face score that masks (Tier-0) AND blocks (gate). One value for both (clamped 0.2-0.6)."],
["mask_pad_ratio","0.15","NUMBER","Total mask padding as a fraction of box size (clamped 0-0.5); minimum 4 px."],
["cloud_image_max_px","1536","NUMBER","Longest side of the redacted JPEG sent to the cloud (clamped 768-2048)."],
["nano_image_max_px","768","NUMBER","Longest side of the JPEG given to Gemini Nano."],
["ocr_max_px","2048","NUMBER","Longest side for Tesseract OCR (the master is already <= 2048)."],
["timeouts_ms",JSON.stringify({advA:90000,advB:60000,explain:20000,deviceImage:60000,deviceText:30000}),"JSON","Per-job timeouts."],
["judge_mode_enabled","true","BOOLEAN","Show Judge Mode."],
["judge_cached_fallback","true","BOOLEAN","When the live adversary is unavailable in Judge Mode, replay the recorded pass-B JSON for the synthetic sample (badge CACHED)."],
["judge_autoplay_default","true","BOOLEAN","Judge Mode autoplay default."],
["atlas_enabled","true","BOOLEAN","Show the opt-in Leak Atlas."],
["extension_enabled","false","BOOLEAN","Stretch: accept files from the Chrome extension."],
["adversary_seed","0","NUMBER","UNVERIFIED experiment: if non-zero, cast-send generationConfig.seed. 0 = do not send."],
];
const t={parameters:Object.fromEntries(P.map(([k,v,ty,d])=>[k,{defaultValue:{value:v},valueType:ty,description:d}]))};
const lines=P.map(([k],i)=>`    ${JSON.stringify(k)}: ${JSON.stringify(t.parameters[k])}${i<P.length-1?',':''}`);
const out=`{\n  "parameters": {\n${lines.join('\n')}\n  }\n}\n`;
JSON.parse(out); for (const [k,v,ty] of P) if (ty==='JSON') JSON.parse(v);
process.stdout.write(out);
