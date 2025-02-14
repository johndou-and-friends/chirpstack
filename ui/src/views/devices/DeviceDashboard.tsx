import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";

import { format, sub } from "date-fns";
import { ReloadOutlined } from "@ant-design/icons";
import type { RadioChangeEvent } from "antd";
import { Descriptions, Space, Card, Statistic, Row, Col, Tabs, Radio, Button, Spin } from "antd";
import { Timestamp } from "google-protobuf/google/protobuf/timestamp_pb";

import type {
  Device,
  GetDeviceMetricsResponse,
  GetDeviceLinkMetricsResponse,
} from "@chirpstack/chirpstack-api-grpc-web/api/device_pb";
import {
  GetDeviceMetricsRequest,
  GetDeviceLinkMetricsRequest,
} from "@chirpstack/chirpstack-api-grpc-web/api/device_pb";
import { Aggregation } from "@chirpstack/chirpstack-api-grpc-web/common/common_pb";
import type { DeviceProfile } from "@chirpstack/chirpstack-api-grpc-web/api/device_profile_pb";

import DeviceStore from "../../stores/DeviceStore";
import MetricChart from "../../components/MetricChart";
import MetricHeatmap from "../../components/MetricHeatmap";
import MetricBar from "../../components/MetricBar";

interface IProps {
  device: Device;
  deviceProfile: DeviceProfile;
  lastSeenAt?: Date;
}

function DeviceDashboard(props: IProps) {
  const [metricsAggregation, setMetricsAggregation] = useState<Aggregation>(Aggregation.DAY);
  const [deviceMetrics, setDeviceMetrics] = useState<GetDeviceMetricsResponse | undefined>(undefined);
  const [deviceLinkMetrics, setDeviceLinkMetrics] = useState<GetDeviceLinkMetricsResponse | undefined>(undefined);
  const [deviceLinkMetricsLoaded, setDeviceLinkMetricsLoaded] = useState<boolean>(false);

  const loadDeviceMetrics = useCallback(
    (start: Date, end: Date, agg: Aggregation) => {
      const startPb = new Timestamp();
      const endPb = new Timestamp();

      startPb.fromDate(start);
      endPb.fromDate(end);

      const req = new GetDeviceMetricsRequest();
      req.setDevEui(props.device.getDevEui());
      req.setStart(startPb);
      req.setEnd(endPb);
      req.setAggregation(agg);

      DeviceStore.getMetrics(req, (resp: GetDeviceMetricsResponse) => {
        setDeviceMetrics(resp);
      });
    },
    [props.device],
  );

  const loadLinkMetrics = useCallback(
    (start: Date, end: Date, agg: Aggregation) => {
      const startPb = new Timestamp();
      const endPb = new Timestamp();

      startPb.fromDate(start);
      endPb.fromDate(end);

      const req = new GetDeviceLinkMetricsRequest();
      req.setDevEui(props.device.getDevEui());
      req.setStart(startPb);
      req.setEnd(endPb);
      req.setAggregation(agg);

      DeviceStore.getLinkMetrics(req, (resp: GetDeviceLinkMetricsResponse) => {
        setDeviceLinkMetrics(resp);
        setDeviceLinkMetricsLoaded(true);
      });
    },
    [props.device],
  );

  const loadMetrics = useCallback(() => {
    const agg = metricsAggregation;
    const end = new Date();
    let start = new Date();

    if (agg === Aggregation.DAY) {
      start = sub(start, { days: 30 });
    } else if (agg === Aggregation.HOUR) {
      start = sub(start, { hours: 24 });
    } else if (agg === Aggregation.MONTH) {
      start = sub(start, { months: 12 });
    }

    setDeviceLinkMetricsLoaded(false);
    loadLinkMetrics(start, end, agg);
    loadDeviceMetrics(start, end, agg);
  }, [loadLinkMetrics, loadDeviceMetrics, metricsAggregation]);

  useEffect(() => {
    loadMetrics();
  }, [props, metricsAggregation, loadMetrics]);

  const onMetricsAggregationChange = (e: RadioChangeEvent) => {
    setMetricsAggregation(e.target.value);
  };

  if (deviceLinkMetrics === undefined || deviceMetrics === undefined) {
    return null;
  }

  const dm = [];

  {
    const states = deviceMetrics.getStatesMap();
    const keys = states.toArray().map(v => v[0]);
    keys.sort();

    for (let i = 0; i < keys.length; i += 3) {
      const items = keys.slice(i, i + 3).map(k => {
        const m = states.get(k)!;
        return (
          <Col span={8}>
            <Card>
              <Statistic title={m.getName()} value={m.getValue()} />
            </Card>
          </Col>
        );
      });

      dm.push(<Row gutter={24}>{items}</Row>);
    }
  }

  {
    const metrics = deviceMetrics.getMetricsMap();
    const keys = metrics.toArray().map(v => v[0]);
    keys.sort();

    for (let i = 0; i < keys.length; i += 3) {
      const items = keys.slice(i, i + 3).map(k => {
        const m = metrics.get(k)!;
        return (
          <Col span={8}>
            <MetricChart metric={m} aggregation={metricsAggregation} zeroToNull />
          </Col>
        );
      });

      dm.push(<Row gutter={24}>{items}</Row>);
    }
  }

  let lastSeenAt = "Never";
  if (props.lastSeenAt !== undefined) {
    lastSeenAt = format(props.lastSeenAt, "YYYY-MM-DD HH:mm:ss");
  }

  const loading = !deviceLinkMetricsLoaded || !deviceMetrics;

  const aggregations = (
    <Space direction="horizontal">
      {loading && <Spin size="small" />}
      <Radio.Group value={metricsAggregation} onChange={onMetricsAggregationChange} size="small">
        <Radio.Button value={Aggregation.HOUR} disabled={loading}>
          24h
        </Radio.Button>
        <Radio.Button value={Aggregation.DAY} disabled={loading}>
          31d
        </Radio.Button>
        <Radio.Button value={Aggregation.MONTH} disabled={loading}>
          1y
        </Radio.Button>
      </Radio.Group>
      <Button type="primary" size="small" icon={<ReloadOutlined />} onClick={loadMetrics} disabled={loading} />
    </Space>
  );

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="large">
      <Card>
        <Descriptions>
          <Descriptions.Item label="Last seen">{lastSeenAt}</Descriptions.Item>
          <Descriptions.Item label="Device profile">
            <Link
              to={`/tenants/${props.deviceProfile.getTenantId()}/device-profiles/${props.deviceProfile.getId()}/edit`}
            >
              {props.deviceProfile.getName()}
            </Link>
          </Descriptions.Item>
          <Descriptions.Item label="Enabled">{props.device.getIsDisabled() ? "no" : "yes"}</Descriptions.Item>
          <Descriptions.Item label="Description">{props.device.getDescription()}</Descriptions.Item>
        </Descriptions>
      </Card>
      <Tabs tabBarExtraContent={aggregations}>
        <Tabs.TabPane tab="Link metrics" key="1">
          <Space direction="vertical" style={{ width: "100%" }} size="large">
            <Row gutter={24}>
              <Col span={8}>
                <MetricChart metric={deviceLinkMetrics.getRxPackets()!} aggregation={metricsAggregation} />
              </Col>
              <Col span={8}>
                <MetricChart metric={deviceLinkMetrics.getGwRssi()!} aggregation={metricsAggregation} zeroToNull />
              </Col>
              <Col span={8}>
                <MetricChart metric={deviceLinkMetrics.getGwSnr()!} aggregation={metricsAggregation} zeroToNull />
              </Col>
            </Row>
            <Row gutter={24}>
              <Col span={8}>
                <MetricHeatmap
                  metric={deviceLinkMetrics.getRxPacketsPerFreq()!}
                  aggregation={metricsAggregation}
                  fromColor="rgb(227, 242, 253)"
                  toColor="rgb(33, 150, 243, 1)"
                />
              </Col>
              <Col span={8}>
                <MetricHeatmap
                  metric={deviceLinkMetrics.getRxPacketsPerDr()!}
                  aggregation={metricsAggregation}
                  fromColor="rgb(227, 242, 253)"
                  toColor="rgb(33, 150, 243, 1)"
                />
              </Col>
              <Col span={8}>
                <MetricBar metric={deviceLinkMetrics.getErrors()!} aggregation={metricsAggregation} />
              </Col>
            </Row>
          </Space>
        </Tabs.TabPane>
        <Tabs.TabPane tab="Device metrics" key="2">
          <Space direction="vertical" style={{ width: "100%" }} size="large">
            {dm}
          </Space>
        </Tabs.TabPane>
      </Tabs>
    </Space>
  );
}

export default DeviceDashboard;
