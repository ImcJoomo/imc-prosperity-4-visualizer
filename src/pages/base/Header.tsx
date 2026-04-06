import { Box, Container, Group, Text, Tooltip } from '@mantine/core';
import { IconArrowsExchange, IconEye, IconHome } from '@tabler/icons-react';
import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useStore } from '../../store.ts';
import classes from './Header.module.css';

export function Header(): ReactNode {
  const location = useLocation();
  const algorithm = useStore(state => state.algorithm);
  const currentLogName = useStore(state => state.currentLogName);

  const logPath = currentLogName ? `/${encodeURIComponent(currentLogName)}` : '';

  const links = [
    <Link
      key="home"
      to={`/${location.search}`}
      className={classes.link}
      data-active={location.pathname === '/' || undefined}
    >
      <Box hiddenFrom="xs">
        <IconHome size={18} />
      </Box>
      <Box visibleFrom="xs">Home</Box>
    </Link>,
  ];

  if (algorithm !== null || currentLogName) {
    links.push(
      <Link
        key="visualizer"
        to={`/visualizer${logPath}${location.search}`}
        className={classes.link}
        data-active={location.pathname.startsWith('/visualizer') || undefined}
      >
        <Box hiddenFrom="xs">
          <IconEye size={18} />
        </Box>
        <Box visibleFrom="xs">Visualizer</Box>
      </Link>,
    );
    links.push(
      <Link
        key="trades"
        to={`/trades${logPath}${location.search}`}
        className={classes.link}
        data-active={location.pathname.startsWith('/trades') || undefined}
      >
        <Box hiddenFrom="xs">
          <IconArrowsExchange size={18} />
        </Box>
        <Box visibleFrom="xs">Trades</Box>
      </Link>,
    );
  } else {
    links.push(
      <Tooltip key="visualizer" label="Load an algorithm first">
        <a className={`${classes.link} ${classes.linkDisabled}`}>
          <Box hiddenFrom="xs">
            <IconEye size={18} />
          </Box>
          <Box visibleFrom="xs">Visualizer</Box>
        </a>
      </Tooltip>,
    );
    links.push(
      <Tooltip key="trades" label="Load an algorithm first">
        <a className={`${classes.link} ${classes.linkDisabled}`}>
          <Box hiddenFrom="xs">
            <IconArrowsExchange size={18} />
          </Box>
          <Box visibleFrom="xs">Trades</Box>
        </a>
      </Tooltip>,
    );
  }

  return (
    <header className={classes.header}>
      <Container size="md" className={classes.inner}>
        <Text size="xl" fw={700}>
          <IconEye size={30} className={classes.icon} />
          IMC Prosperity 4 Visualizer
        </Text>

        <Group gap={5}>{links}</Group>
      </Container>
    </header>
  );
}
