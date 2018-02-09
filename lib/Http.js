class Http {
    makeRequest(method, url, data) {
        return new Promise((resolve) => {
            const req = new XMLHttpRequest();
            req.open(method, url);
            req.onload = () => {
                if (req.status == 200) {
                    resolve({
                        results: req.response,
                        data
                    });
                } else {
                    reject(Error(req.statusText));
                }
            };
            req.onerror = () => {
                reject(Error('Something went wrong...'));
            };
            req.send(data);
        });
    }
};
