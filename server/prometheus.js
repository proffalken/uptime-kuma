const { R } = require("redbean-node");
const PrometheusClient = require("prom-client");
const { log } = require("../src/util");

const commonLabels = [
    "monitor_name",
    "monitor_type",
    "monitor_url",
    "monitor_hostname",
    "monitor_port",
    "location",
    "region",
    "datacenter",
    "cloud_provider",
    "az",
    "rack",
    "shelf",
    "room",
    "floor",
];

const monitorCertDaysRemaining = new PrometheusClient.Gauge({
    name: "monitor_cert_days_remaining",
    help: "The number of days remaining until the certificate expires",
    labelNames: commonLabels
});

const monitorCertIsValid = new PrometheusClient.Gauge({
    name: "monitor_cert_is_valid",
    help: "Is the certificate still valid? (1 = Yes, 0= No)",
    labelNames: commonLabels
});
const monitorResponseTime = new PrometheusClient.Gauge({
    name: "monitor_response_time",
    help: "Monitor Response Time (ms)",
    labelNames: commonLabels
});

const monitorStatus = new PrometheusClient.Gauge({
    name: "monitor_status",
    help: "Monitor Status (1 = UP, 0= DOWN)",
    labelNames: commonLabels
});

class Prometheus {
    monitorLabelValues = {};

    async getMonitorTags(monitor) {
        console.log("Getting Tags for Prometheus");

        const tags = await R.getAll("SELECT mt.*, tag.name, tag.color FROM monitor_tag mt JOIN tag ON mt.tag_id = tag.id WHERE mt.monitor_id = ?", [ monitor.id ]);

        return tags;
    }

    /**
     * @param {Object} monitor Monitor object to monitor
     */
    constructor(monitor) {
        this.monitorLabelValues = {
            monitor_name: monitor.name,
            monitor_type: monitor.type,
            monitor_url: monitor.url,
            monitor_hostname: monitor.hostname,
            monitor_port: monitor.port
        };

        this.getMonitorTags(monitor).then(tags => {
            for (let tag in tags) {
                let tagDetail = tags[tag];
                let name = tagDetail.name;
                let value = tagDetail.value;
                console.log("New tag created: {" + name + ": " + value + "}");
                this.monitorLabelValues[name] = value;
            }
        }
        );
    }

    /**
     * Update the metrics page
     * @param {Object} heartbeat Heartbeat details
     * @param {Object} tlsInfo TLS details
     */
    update(heartbeat, tlsInfo) {

        if (typeof tlsInfo !== "undefined") {
            try {
                let isValid;
                if (tlsInfo.valid === true) {
                    isValid = 1;
                } else {
                    isValid = 0;
                }
                monitorCertIsValid.set(this.monitorLabelValues, isValid);
            } catch (e) {
                log.error("prometheus", "Caught error");
                log.error("prometheus", e);
            }

            try {
                if (tlsInfo.certInfo != null) {
                    monitorCertDaysRemaining.set(this.monitorLabelValues, tlsInfo.certInfo.daysRemaining);
                }
            } catch (e) {
                log.error("prometheus", "Caught error");
                log.error("prometheus", e);
            }
        }

        try {
            monitorStatus.set(this.monitorLabelValues, heartbeat.status);
        } catch (e) {
            log.error("prometheus", "Caught error");
            log.error("prometheus", e);
        }

        try {
            if (typeof heartbeat.ping === "number") {
                monitorResponseTime.set(this.monitorLabelValues, heartbeat.ping);
            } else {
                // Is it good?
                monitorResponseTime.set(this.monitorLabelValues, -1);
            }
        } catch (e) {
            log.error("prometheus", "Caught error");
            log.error("prometheus", e);
        }
    }

    remove() {
        try {
            monitorCertDaysRemaining.remove(this.monitorLabelValues);
            monitorCertIsValid.remove(this.monitorLabelValues);
            monitorResponseTime.remove(this.monitorLabelValues);
            monitorStatus.remove(this.monitorLabelValues);
        } catch (e) {
            console.error(e);
        }
    }
}

module.exports = {
    Prometheus
};
