import { useEffect, useState } from "react";
import { MapPanel, type MapTopics } from "./panels/MapPanel.tsx";
import { TeleopPanel } from "./panels/TeleopPanel.tsx";
import { VideoPanel } from "./panels/VideoPanel.tsx";
import { StatusBar } from "./ui/StatusBar.tsx";
import { type ConnectionState, type Link, TOPICS } from "./zenoh.ts";
import styles from "./App.module.css";

const MAP_TOPICS: MapTopics = { costmap: TOPICS.costmap, pose: TOPICS.odom, path: TOPICS.path };

export function App({ link, bridge }: { link: Link | null; bridge: string }) {
  const [state, setState] = useState<ConnectionState>(link?.zenoh.state ?? "connecting");
  useEffect(() => {
    if (link === null) return;
    setState(link.zenoh.state);
    return link.zenoh.onState(setState);
  }, [link]);

  return (
    <div className={styles.app}>
      <StatusBar state={state} bridge={bridge} />
      <main className={styles.main}>
        {link === null
          ? <p className={styles.notice}>Waiting for Desktop's zenoh-web bridge at {bridge}...</p>
          : (
            <div className={styles.grid}>
              <div className={styles.video}>
                <VideoPanel link={link} topic={TOPICS.image} title="Camera" />
              </div>
              <div className={styles.map}>
                <MapPanel link={link} topics={MAP_TOPICS} />
              </div>
              <div className={styles.teleop}>
                <TeleopPanel link={link} topic={TOPICS.teleop} />
              </div>
            </div>
          )}
      </main>
    </div>
  );
}
