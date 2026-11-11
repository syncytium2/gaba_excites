function kndy_oracle(srcDir, outFile)
% KNDY_ORACLE  Reference numbers for the arcuate kisspeptin (KNDy) cell of Qiu et al. 2024
% (eLife 13:RP96691, doi:10.7554/eLife.96691), from the authors' own MATLAB code.
%
% Runs the ARCHIVED right-hand side, Kiss1_model.m, unchanged, and writes resting potentials,
% input resistance and the spike times of a current-step family to
% src/core/oracle/matlab_kndy.json. src/core/kndy.test.ts holds the TypeScript port to them.
%
% The MATLAB is not vendored here: the archive has no license file, and this repository is
% public. Fetch it from Software Heritage, swh:1:dir:585910cdf67ffc5ccef5aec83674b19da1aca8b1
% (the paper's own link, git.exeter.ac.uk/mv286/kiss1-arcuate-neuron-model, refused connections
% on 2026-11-11):
%
%   mkdir -p /tmp/kiss1 && cd /tmp/kiss1
%   for f in Kiss1_model.m Kiss1_model_parameters.m; do
%     curl -sL "https://archive.softwareheritage.org/api/1/directory/c04ed5591ac75e350bb8848654168096484c058e/" \
%       | python3 -c "import json,sys;print([e['target'] for e in json.load(sys.stdin) if e['name']=='$f'][0])" \
%       | xargs -I{} curl -sL -o $f "https://archive.softwareheritage.org/api/1/content/sha1_git:{}/raw/"
%   done
%   matlab -batch "addpath('tools'); kndy_oracle('/tmp/kiss1', 'src/core/oracle/matlab_kndy.json')"
%
% Six cells are run: three parameter SOURCES, each in the ovariectomized state (OVX) and with
% estradiol (OVX+E2).
%
%   code      Kiss1_model_parameters.m as archived. This is what the authors' script runs.
%   table     the values of the paper's Appendix 1-table 1 where they differ from the code,
%             in the code's equations (so the calcium leak keeps the code's voltage dependence).
%   written   the table's values AND the paper's leak equation, I_leak,Ca = g (V - E_Ca) with no
%             voltage dependence, which the code does not use.
%
% Every difference between table and code is listed in TABLE below and in lit/notes/qiu2024.md.
% GIRK is silent in all six: with no agonist its activator stays at zero in code and paper alike.
%
% Protocol. Start from the script's initial state (all zeros, both inactive activators at 1) and
% run 20 s at 0 pA, as Kiss1_model_scirpt.m does. From that state: a 5 s step of each amplitude
% (the cell returns to the settled state before every step), then a -2 pA step for input
% resistance. Solver: ode45, RelTol 1e-9, AbsTol 1e-11, MaxStep 1 ms, far tighter than the
% script's defaults (RelTol 1e-3), because spike times at the script's tolerance wander by
% milliseconds. The resting potentials are ALSO computed at the script's own tolerance, to
% compare with the script's comment "%-68.9241  -70.9198".

if nargin < 2, outFile = 'src/core/oracle/matlab_kndy.json'; end
addpath(srcDir);
Kiss1_model_parameters;   %#ok<NODEF> defines params and params_OVXE2

% Appendix 1-table 1 where it differs from the code: {field, OVX value, OVX+E2 value}
TABLE = { ...
  'mNaTk',    3,       3; ...       % code 7
  'hNaTk',    -8.2,    -8.2; ...    % code -2
  'hNaPk',    -8.5,    -8.5; ...    % code -8.2
  'taumAp',   20,      20; ...      % code 10
  'tauhAp',   10,      10; ...      % code 20
  'V_BK0',    -22.52,  -22.52; ...  % code 0.1
  'K_ca',     0.45,    0.45; ...    % code 0.74
  'n_ca',     4,       4; ...       % code 2.2
  'gSK',      28.13,   26.05; ...   % code 28.13 in both states
  'gh',       0.56,    11.23; ...   % code 0.5617, 11.234
  'gT',       0.66,    5; ...       % code 0.666, 4.995
  'mCatau',   300,     300; ...     % code 10
  'hCatau',   10,      10; ...      % code 300
  'kCa_trpc', 0.33,    0.33; ...    % code 1/3
  'gamma',    1.96e-5, 1.96e-5 };   % code 1.9631e-5

sets = struct('source', {}, 'state', {}, 'p', {});
base = {params, params_OVXE2}; states = {'OVX', 'OVXE2'};
for k = 1:2
  p = base{k}; sets(end+1) = struct('source', 'code', 'state', states{k}, 'p', p); %#ok<AGROW>
  for r = 1:size(TABLE, 1), p.(TABLE{r, 1}) = TABLE{r, 1 + k}; end
  sets(end+1) = struct('source', 'table', 'state', states{k}, 'p', p); %#ok<AGROW>
  p.VleakCa = -1e6;   % the sigmoid is then 1: a plain leak, as the paper writes it
  sets(end+1) = struct('source', 'written', 'state', states{k}, 'p', p); %#ok<AGROW>
end

tight = odeset('RelTol', 1e-9, 'AbsTol', 1e-11, 'MaxStep', 1);
loose = odeset('MaxStep', 1);
amps = [5 10 15 20 30 40 60 80 120];
stepMs = 5000; dtOut = 0.01; level = -20;

out = struct('source', 'Qiu et al. 2024 archived code, swh:1:dir:585910cdf67ffc5ccef5aec83674b19da1aca8b1', ...
  'matlab', version, 'solver', 'ode45 RelTol 1e-9 AbsTol 1e-11 MaxStep 1 ms', ...
  'settleMs', 20000, 'stepMs', stepMs, 'spikeLevel', level, 'cells', {{}});

for s = 1:numel(sets)
  p = sets(s).p; p.Iapp = 0; p.slope = 0;
  x0 = zeros(19, 1); x0(15) = 1; x0(17) = 1;
  c = struct('source', sets(s).source, 'state', sets(s).state);
  [~, Xl] = ode45(@(t, y) Kiss1_model(t, y, p), 0:1:20000, x0, loose);
  c.vRestScript = Xl(end, 1);
  [~, X] = ode45(@(t, y) Kiss1_model(t, y, p), 0:1:20000, x0, tight);
  xs = X(end, :)';
  last = X(end-4999:end, 1);
  c.vRest = xs(1); c.caRest = xs(14); c.trpcActRest = xs(16);
  c.vMinLast5s = min(last); c.vMaxLast5s = max(last);
  c.resting = (max(last) - min(last)) < 0.01;
  c.state19 = xs';
  % input resistance: -2 pA for 5 s, the steady change (and the change at 500 ms, before slow gates move far)
  q = p; q.Iapp = -2;
  [~, Xr] = ode45(@(t, y) Kiss1_model(t, y, q), [0 500 5000], xs, tight);
  c.rinMOhm500 = (Xr(2, 1) - xs(1)) / -2 * 1000;
  c.rinMOhm5000 = (Xr(3, 1) - xs(1)) / -2 * 1000;
  c.sweeps = {};
  for a = amps
    q = p; q.Iapp = a;
    [T, Xa] = ode45(@(t, y) Kiss1_model(t, y, q), 0:dtOut:stepMs, xs, tight);
    v = Xa(:, 1);
    up = find(v(1:end-1) < level & v(2:end) >= level);
    tsp = T(up) + (level - v(up)) ./ (v(up+1) - v(up)) * dtOut;
    c.sweeps{end+1} = struct('amp', a, 'spikes', tsp(:)', 'nSpikes', numel(tsp), ...
      'vMax', max(v), 'vEnd', v(end), 'vAt', v(1:10000:end)');
  end
  out.cells{end+1} = c;
  fprintf('%-8s %-6s rest %.4f (script tol %.4f) resting=%d Rin %.0f/%.0f MOhm  spikes:', ...
    c.source, c.state, c.vRest, c.vRestScript, c.resting, c.rinMOhm500, c.rinMOhm5000);
  fprintf(' %d', cellfun(@(z) z.nSpikes, c.sweeps)); fprintf('\n');
end

fid = fopen(outFile, 'w'); fwrite(fid, jsonencode(out, 'PrettyPrint', true)); fclose(fid);
end
