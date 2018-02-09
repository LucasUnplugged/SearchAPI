// Custom hash table for managing word frequency
class WordMap {
    constructor() {
        let _table = [];

        // PRIVATE METHODS ////////////////////////////////////////////////////
        // Generate hash index
        // SOURCE: https://github.com/darkskyapp/string-hash
        const _getIndex = (sourceWord) => {
            const word = sourceWord.toLowerCase();
            let hash = 5381;
            let index = word.length;
            while(index) {
                hash = (hash * 33) ^ word.charCodeAt(--index);
            }
            /* JavaScript does bitwise operations (like XOR, above) on 32-bit signed
            * integers. Since we want the results to be always positive, convert the
            * signed int to an unsigned by doing an unsigned bitshift. */
            return hash >>> 0;
        }

        // PRIVILEGED METHODS /////////////////////////////////////////////////
        // NOTE: Implementation is NOT case sensitive
        // Fetch word frequency
        this.getFrequency = (word) => {
            const index = _getIndex(word);
            return (_table[index] === undefined) ? 0 : _table[index];
        };

        // Check if the word is listed
        this.has = (word) => {
            const index = _getIndex(word);
            return (_table[index] === undefined) ? false : true;
        };

        // Save word
        this.add = (word) => {
            const index = _getIndex(word);

            // Increment the count for this word
            if (_table[index] === undefined) {
                _table[index] = 1;
            } else {
                _table[index]++;
            }
        };

        // Reset the table
        this.reset = () => {
            _table = [];
        };
    }
}
