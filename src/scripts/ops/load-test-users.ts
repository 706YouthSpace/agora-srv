// import xlsx from 'xlsx';
// import { resolve } from 'path';
// import program from 'commander';
// import { provinces, provinceToCities, cities, DISTRICTS } from '../../lib/chinese-province';
// import { userMongoOperations } from '../../db/index';
// import { randomText } from 'svg-captcha';
// import { wxService } from '../../services/wexin';

// program
//     .version('0.1.0')
//     .usage('<inputLocaiton>')
//     .parse(process.argv);

// const wxAppId = wxService.config.appId;
// async function main() {

//     const inputPath = program.args[0];
//     if (!inputPath) {
//         return;
//     }
//     const inputFilePath = resolve(inputPath);

//     const workBook = xlsx.readFile(inputFilePath);

//     const theFirstSheet = workBook.Sheets[workBook.SheetNames[0]];

//     const stuff = xlsx.utils.sheet_to_json<any>(theFirstSheet, { blankrows: false });

//     const entriesRead: any[] = [];
//     for (const x of stuff) {
//         const homeTown = x['家乡'];
//         let province;
//         let city;
//         if (homeTown) {
//             for (const p of Object.keys(provinces)) {
//                 if (homeTown.includes(p)) {
//                     province = p;
//                 }
//             }
//             if (province) {
//                 for (const c of Object.keys(provinceToCities[province])) {
//                     if (homeTown.includes(c)) {
//                         city = c;
//                     }
//                 }
//             } else {
//                 const cityCode = cities[homeTown];
//                 if (cityCode) {
//                     city = homeTown;
//                     const provinceVec = (DISTRICTS as any)[`${cityCode.substring(0, 2)}0000`];
//                     if (provinceVec) {
//                         province = provinceVec[0];
//                     }
//                 }
//             }
//         }
//         let gender;
//         if (x['性别'] === '男') {
//             gender = 'male';
//         }
//         if (x['性别'] === '女') {
//             gender = 'female'
//         }

//         entriesRead.push({
//             nickName: x['姓名'],
//             gender,
//             province,
//             city,
//             cellphone: x['手机'],
//             wxId: x['微信号'],
//             organization: x['学校/专业 | 单位/职位'],
//             brefExperience: x['说说你的爱好，经历和故事，来北京做的事情和你以后想做的事情'],
//             brefConcerns: x['你最希望在“青年共享社区”收获什么？你需要706给你提供哪些帮助？']
//         });
//     }


//     for (const profile of entriesRead) {
//         const ts = Date.now();
//         const wxOpenId = `_fake${randomText(27)}`;
//         const r = await userMongoOperations.insertOne(
//             // tslint:disable-next-line: no-magic-numbers
//             { wxOpenId, createdAt: ts, wxaId: wxAppId, } as any
//         );
//         await userMongoOperations.updateProfile(profile, wxAppId, wxOpenId);
//         console.log(r);
//     }

//     await process.exit(0);

// }

// main().catch((err) => {
//     console.error(err);
//     process.exit(1);
// });
