class SearchAPI {
    constructor() {
        // PRIVATE PROPERTIES / METHODS ///////////////////////////////////////
        const _http = new Http();
        const _searchCorpus = new WordMap();
        const _searchHistory = new WordMap();
        const _getFrequencyFromCorpus = (word) => {
            return new Promise((resolve) => resolve(_searchCorpus.getFrequency(word)));
        };
        const _getFrequencyFromHistory = (word) => {
            return new Promise((resolve) => resolve(_searchHistory.getFrequency(word)));
        };

        // Mock constants for qualifier values
        const QUALIFIERS = {
            alternatePercentiles: {
                high: 99,
                medium: 95
            },
            frequency: {
                high: 5,
                medium: 2
            },
            rank: {
                numberToKeep: 3
            }
        };

        // Singleton to manage word qualification/processing
        const wordQualifier = {
            processWord(word) {
                // Chaining of qualifiers is as per logic flow diagrams
                const qualifiers = {
                    isSuperCommon: (word) => new Promise(
                        (resolve) => resolve(word.frequency > QUALIFIERS.frequency.high)
                    ),
                    isSomewhatCommon: (word) => new Promise(
                        (resolve) => resolve(word.frequency > QUALIFIERS.frequency.medium)
                    ),
                    hasSuperAlternates: (word) => new Promise((resolve) => {
                        // Only alternates in the 99 percentile qualify
                        let qualified = word.alternates.filter(
                            (alternate) => alternate.score >= QUALIFIERS.alternatePercentiles.high
                        );
                        resolve((qualified.length > 0) ? qualified : []);
                    }),
                    hasMediumAlternates: (word) => new Promise((resolve) => {
                        // Only alternates in the 95 percentile qualify
                        let qualified = word.alternates.filter(
                            (alternate) => alternate.score >= QUALIFIERS.alternatePercentiles.medium
                        );
                        resolve((qualified.length > 0) ? qualified : []);
                    })

                };
                return new Promise((resolve) => {
                    qualifiers.isSuperCommon(word).then(isSuperCommon => {
                        if (isSuperCommon) {
                            resolve([]);
                        } else {
                            qualifiers.isSomewhatCommon(word).then(isSomewhatCommon => {
                                if (isSomewhatCommon) {
                                    qualifiers.hasSuperAlternates(word).then((qualified) => resolve(qualified));
                                } else {
                                    qualifiers.hasMediumAlternates(word).then(qualified => {
                                        if (qualified.length > 0) {
                                            resolve(qualified);
                                        } else {
                                            // TODO: Introduce secondary qualifiers
                                            resolve(qualified);
                                        }
                                    });
                                }
                            })
                        }
                    });
                });
            },
            getAlternateFrequencies(alternate) {
                return new Promise((resolve) => {
                    Promise.all([
                        _getFrequencyFromCorpus(alternate.word), // Get alternate frequency from history
                        _getFrequencyFromHistory(alternate.word) // Get alternate frequency from crawler
                    ]).then((response) => resolve({
                        webFrequency: response[0],
                        historyFrequency: response[1],
                        sourceFrequency: alternate.sourceFrequency,
                        sourceWord: alternate.sourceWord,
                        word: alternate.word,
                        score: alternate.score
                    }))
                });
            },
            qualifyAlternate(rawAlternate) {
                // Chaining of qualifiers is as per logic flow diagrams
                const qualifiers = {
                    isInHistory: (alternate) => new Promise(
                        (resolve) => resolve(alternate.historyFrequency > 0)
                    ),
                    isMoreCommonThanOriginal: (alternate) => new Promise(
                        (resolve) => resolve(alternate.webFrequency && alternate.webFrequency >= alternate.sourceFrequency)
                    )
                };
                return new Promise((resolve) => {
                    this.getAlternateFrequencies(rawAlternate).then(alternate => {
                        qualifiers.isInHistory(alternate).then(isInHistory => {
                            if (isInHistory) {
                                resolve(alternate);
                            } else {
                                qualifiers.isMoreCommonThanOriginal(alternate).then(isMoreCommonThanOriginal => {
                                    if (isMoreCommonThanOriginal) {
                                        resolve(alternate);
                                    } else {
                                        resolve(null);
                                    }
                                });
                            }
                        });
                    });
                });
            },
            sanitizeAlternates(sourceAlternates) {
                let completedWords = [];
                let sanitized = {};
                for (let alternateSet of sourceAlternates) {
                    let filtered = alternateSet.filter((set) => {
                        if (set) {
                            if (completedWords.includes(set.word)) {
                                return false;
                            } else {
                                completedWords.push(set.word);
                                return true;
                            }
                        }
                        return false;
                    });
                    if (filtered && filtered.length > 0) {
                        sanitized[filtered[0].sourceWord] = filtered;
                    }
                }
                return sanitized;
            },
            sortBy(data, key) {
                return data.sort((first, second) => {
                    if (first[key] > second[key]) {
                        return -1;
                    } else if (first[key] < second[key]) {
                        return 1;
                    }
                    return 0;
                })
            },
            scoreTopOptions(data, key, add) {
                // History counts twice as much as other scoring properties
                let score = 6;
                let scoreModifier = (key === 'historyFrequency') ? 2 : 1;
                let index = 0;
                let prevKey;
                while (data[index] && index < QUALIFIERS.rank.numberToKeep) {
                    let instance = data[index];
                    if (instance[key] !== prevKey) {
                        score--;
                    }
                    index++;
                    prevKey = instance[key];
                    for (var loops = 0; loops < score * scoreModifier; loops++) {
                        add(instance.word);
                    }
                }
            },
            rankAlternates(sourceAlternates) {
                if (sourceAlternates.length === 1) {
                    return sourceAlternates;
                }

                let ranked = {};

                for (let word in sourceAlternates) {
                    if(sourceAlternates.hasOwnProperty(word)) {
                        const scores = new WordMap();
                        let alternates = sourceAlternates[word];
                        this.scoreTopOptions(
                            this.sortBy(alternates, 'webFrequency'),
                            'webFrequency',
                            (altWord) => scores.add(altWord)
                        );
                        this.scoreTopOptions(
                            this.sortBy(alternates, 'historyFrequency'),
                            'historyFrequency',
                            (altWord) => scores.add(altWord)
                        );
                        this.scoreTopOptions(
                            this.sortBy(alternates, 'score'),
                            'score',
                            (altWord) => scores.add(altWord)
                        );

                        // Sort based on compiled scores
                        let rank = alternates.sort((first, second) => {
                            const firstCount = scores.getFrequency(first.word);
                            const secondCount = scores.getFrequency(second.word);
                            if (firstCount > secondCount) {
                                return -1;
                            } else if (firstCount < secondCount) {
                                return 1;
                            }
                            return 0;
                        });

                        // Add only the top 5
                        ranked[word] = rank.filter((item, index) => index < 5);
                    }
                }
                return ranked;
            },
            compileSuggestions(words, alternates) {
                let completed = [];
                let suggestions = [];
                let index = 0;

                // If there are no alternates available, then return no suggestions (empty array)
                if (Object.keys(alternates).length === 0) {
                    return suggestions;
                }

                while (words.length > completed.length) {
                    let sentence = [];
                    for (let word of words) {
                        let wordAlternates = alternates[word];
                        if (wordAlternates) {
                            let isLastAlternate = !wordAlternates[index] || !wordAlternates[index + 1];
                            if (isLastAlternate && !completed.includes(word)) {
                                completed.push(word);
                            }
                            if (wordAlternates[index]) {
                                sentence.push(wordAlternates[index].word);
                            } else {
                                sentence.push(wordAlternates[0].word);
                            }
                        } else {
                            if (!completed.includes(word)) {
                                completed.push(word);
                            }
                            sentence.push(word);
                        }
                    }
                    suggestions.push(sentence.join(' '));
                    index++;
                }

                return suggestions;
            },
            prepSuggestions(words, alternates) {
                return new Promise((resolve) => {
                    let cleanAlternates = this.sanitizeAlternates(alternates);
                    cleanAlternates = this.rankAlternates(cleanAlternates);
                    resolve(this.compileSuggestions(words, cleanAlternates));
                });
            }
        };


        // PRIVILEGED METHODS /////////////////////////////////////////////////
        this.addCorpusWords = (words) => {
            for (let word of words) {
                _searchCorpus.add(word);
            }
        };

        this.addHistoryWords = (words) => {
            for (let word of words) {
                _searchHistory.add(word);
            }
        };

        this.getAlternates = (word) => {
            return _http.makeRequest('GET', `https://api.datamuse.com/words?sl=${word}`, word).then(
                (response) => new Promise((resolve) => resolve(JSON.parse(response.results))),
                (response) => new Promise((resolve) => {
                    // In real word use, errors could be logged from here
                    console.warn(response);
                    // Fail gracefully
                    resolve([]);
                })
            );
        };

        this.getTypeAhead = (word) => {
            return _http.makeRequest('GET', `https://api.datamuse.com/sug?s=${word}`, word).then(
                (response) => new Promise((resolve) => resolve(JSON.parse(response.results))),
                (response) => new Promise((resolve) => {
                    // In real word use, errors could be logged from here
                    console.warn(response);
                    // Fail gracefully
                    resolve([]);
                })
            );
        };

        this.getFrequency = _getFrequencyFromCorpus;

        this.getSuggestions = (sourceInput, callback) => {
            return new Promise((resolve) => {
                if (typeof sourceInput === 'string' && sourceInput.length > 0) {
                    const words = sourceInput.split(' ');
                    let results = {};
                    let qualifierPromises = [];

                    for (let word of words) {
                        qualifierPromises.push(
                            Promise.all([
                                this.getAlternates(word), // Get "sounds like" alternates from Datamuse API
                                this.getTypeAhead(word), // Get "type ahead" alternates from Datamuse API
                                this.getFrequency(word) // Get word frequency in the (mock) search corpus
                            ])
                            .then((response) => wordQualifier.processWord({
                                sourceWord: word,
                                frequency: response[2],
                                alternates: this.prepareAlternates(word, response[0], response[1], response[2])
                            }))
                            .then((rawAlternates) => {
                                let alternatesPromises = [];
                                for (let alternate of rawAlternates) {
                                    alternatesPromises.push(wordQualifier.qualifyAlternate(alternate));
                                }
                                return Promise.all(alternatesPromises);
                            })
                        );
                    }

                    Promise.all(qualifierPromises)
                        .then((alternates) => wordQualifier.prepSuggestions(words, alternates))
                        .then((suggestions) => resolve(suggestions));
                }
            });
        };
    }

    prepareAlternates(word, alternates, typeAhead, frequency) {
        const combinedAlternates = alternates
            .concat(typeAhead.map(
                (suggestion) => ({
                    word: suggestion.word,
                    score: Math.min(99, suggestion.score)
                })
            ))
            .sort((first, second) => {
                if (first.score < second.score) {
                    return 1;
                } else if (first.score > second.score) {
                    return -1;
                }
                return 0;
            });
        let filtered = [];
        for (let alternate of combinedAlternates) {
            const isNotOriginalWord = alternate.word.toLowerCase() !== word.toLowerCase();
            if (alternate.score >= 95 && isNotOriginalWord) {
                filtered.push({
                    score: alternate.score,
                    word: alternate.word,
                    sourceWord: word,
                    sourceFrequency: frequency
                });
            }
        }
        return filtered;
    }
};
