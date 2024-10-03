class RequestQueue {
    constructor(interval = 100, batchSize = 5) {
        this.queue = [];
        this.interval = interval;
        this.batchSize = batchSize;
        this.isProcessing = false;
    }

    add(requestFunc) {
        this.queue.push(requestFunc);
        this.processQueue();
    }

    async processQueue() {
        if (this.isProcessing) return;

        this.isProcessing = true;
        while (this.queue.length > 0) {
            const batch = this.queue.splice(0, this.batchSize); // Get a batch of requests
            const batchStartTime = new Date(); // Record start time of batch processing

            // Execute the batch of requests concurrently
            try {
                await Promise.all(batch.map(requestFunc => requestFunc()));
            } catch (error) {
                console.error("Error processing batch:", error);
            }

            const batchEndTime = new Date(); // Record end time of batch processing
            const batchDuration = batchEndTime - batchStartTime; // Calculate duration of batch processing

            // Calculate remaining time to wait based on the interval and the batch processing duration
            const remainingWaitTime = this.interval - batchDuration;
            if (remainingWaitTime > 0) {
                await this.delay(remainingWaitTime); // Wait before processing the next batch
            }
        }

        this.isProcessing = false;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getQueueSize() {
        return this.queue.length;
    }
}

module.exports = RequestQueue;
