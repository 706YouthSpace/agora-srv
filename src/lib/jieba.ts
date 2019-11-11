import jieba from 'nodejieba';
import _ from 'lodash';
import fs from 'fs';

export interface JiebaDictConfig {
    dict?: string;
    hmmDict?: string;
    userDict?: string;
    idfDict?: string;
    stopWordDict?: string;
}

export class JiebaAnalyzer {
    config?: JiebaDictConfig;

    stopWords = new Set<string>();

    constructor(config?: JiebaDictConfig) {
        this.config = config;
        jieba.load(this.config!);
        const stopWordDict = _.get(this.config, 'stopWordDict') || (jieba as any).DEFAULT_STOP_WORD_DICT;
        const stopWordContent = fs.readFileSync(stopWordDict, { encoding: 'utf-8' });
        stopWordContent.split('\n').forEach((x) => {
            const word = x.trim();
            if (word) {
                this.stopWords.add(word);
            }
        });
        this.stopWords.add(' ');
        this.stopWords.add('\n');
    }

    analyze(content: string) {
        const tokens: string[] = jieba.cut(content, true);
        const result: {[k: string]: number} = {};

        for (const token of tokens) {
            if (this.stopWords.has(token)) {
                continue;
            }
            result[token] = ((result[token] || 0) + 1);
        }

        return result;
    }

    analyzeForIndex(content: string) {
        const tokens: string[] = jieba.cutForSearch(content, true);
        const result: {[k: string]: number} = {};

        for (const token of tokens) {
            if (this.stopWords.has(token)) {
                continue;
            }
            result[token] = ((result[token] || 0) + 1);
        }

        return result;
    }

    analyzeSmall(content: string, factor = 2) {
        const tokens: string[] = jieba.cutSmall(content, factor);
        const result: {[k: string]: number} = {};

        for (const token of tokens) {
            if (this.stopWords.has(token)) {
                continue;
            }
            result[token] = ((result[token] || 0) + 1);
        }

        return result;
    }

}

